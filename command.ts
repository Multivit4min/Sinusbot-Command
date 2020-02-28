//reference the global definition file by default its ./node_modules/sinusbot-scripting-engine/typings/global.d.ts
///<reference path="node_modules/sinusbot/typings/global.d.ts" />

import type { Client } from "sinusbot/typings/interfaces/Client"
import type { MessageEvent } from "sinusbot/typings/external/command"
import type { DiscordMessage } from "sinusbot/typings/interfaces/DiscordMessage"

registerPlugin({
  name: "Command Library",
  description: "Library to handle and manage commands",
  version: "1.4.3",
  author: "Multivitamin <david.kartnaller@gmail.com>",
  autorun: true,
  backends: ["ts3", "discord"],
  vars: [{
    name: "NOT_FOUND_MESSAGE",
    title: "Send a message if no command has been found?",
    type: "select",
    options: ["YES", "NO"],
    default: "1"
  }, {
    name: "DEBUGLEVEL",
    title: "Debug Messages (default is INFO)",
    type: "select",
    options: ["ERROR", "WARNING", "INFO", "VERBOSE"],
    default: "2"
  }]
}, (_, { DEBUGLEVEL, NOT_FOUND_MESSAGE }, { version }) => {

  const engine = require("engine")
  const event = require("event")
  const backend = require("backend")
  const format = require("format")

  /**
   * @param level
   * @return {(mode: number) => (...args: any[]) => void}
   * @private
   */
  function DEBUG(level: number) {
    /**
     * @param mode the loglevel to log
     * @param args data to log
     * @private
     */
    const logger = (mode: number, ...args: string[]) => {
      if (mode > level) return
      engine.log(...args)
    }

    return (mode: number) => logger.bind(null, mode)
  }
  DEBUG.VERBOSE = 3
  DEBUG.INFO = 2
  DEBUG.WARNING = 1
  DEBUG.ERROR = 0
  /** @private */
  const debug = DEBUG(parseInt(DEBUGLEVEL, 10))


  ////////////////////////////////////////////////////////////
  ////                     TYPES                          ////
  ////////////////////////////////////////////////////////////

  /** callback for the command event */
  type createArgumentHandler = (arg: ArgType) => Argument
  type replyHandler = (msg: string) => void
  type GroupArgumentType = "or"|"and"
  type execHandler = (client: Client, args: Record<string, any>, reply: replyHandler, event: MessageEvent) => void
  type permissionHandler = (client: Client) => Promise<boolean>|boolean

  interface ArgType {
    string: StringArgument
    number: NumberArgument
    client: ClientArgument
    rest: RestArgument
    or: GroupArgument
    and: GroupArgument
  }

  interface CommanderTextMessage {
    reply: replyHandler
    client: Client
    arguments: Record<string, any>
    raw: MessageEvent
    message: DiscordMessage
  }

  interface IThrottle {
    timeTillNextCommand(client: Client): number
    isThrottled(client: Client): boolean
    throttle(client: Client): void
  }

  interface ThrottleInterface {
    points: number
    next: number
    timeout: number
  }


  ////////////////////////////////////////////////////////////
  ////                   EXCEPTIONS                       ////
  ////////////////////////////////////////////////////////////

  /**
   * class representing a ThrottleError
   * @private
   */
  class ThrottleError extends Error {
    constructor(err: string) {
      super(err)
    }
  }

  /**
   * class representing a TooManyArguments
   * @private
   */
  class TooManyArgumentsError extends Error {

    readonly parseError: ParseError|undefined

    constructor(err: string, parseError?: ParseError) {
      super(err)
      this.parseError = parseError
    }
  }

  /**
   * class representing a ParseError
   * gets thrown when an Argument has not been parsed successful
   * @private
   */
  class ParseError extends Error {
    
    readonly argument: Argument

    constructor(err: string, argument: Argument) {
      super(err)
      this.argument = argument
    }
  }

  /**
   * class representing a SubCommandNotFoundError
   * @private
   */
  class CommandNotFoundError extends Error {
    constructor(err: string) {
      super(err)
    }
  }

  /**
   * class representing a PermissionError
   * @private
   */
  class PermissionError extends Error {
    constructor(err: string) {
      super(err)
    }
  }


  ////////////////////////////////////////////////////////////
  ////                  ARGUMENTS                         ////
  ////////////////////////////////////////////////////////////


  abstract class Argument {

    /** defines if the argument is optional */
    private opt: boolean = false
    private name: string = "_"
    private display: string = "_"
    private displayDefault: boolean = true
    private default: any = undefined

    /**
     * @param {string} args the string which the argument should be validated agains
     * @returns {any[]}
     */
    abstract validate(args: string): any[]

    /**
     * sets an Argument as optional
     * if the argument has not been parsed successful it will use the first argument which has been given inside this method
     * @param fallback the default value which should be set if this parameter has not been found
     * @param displayDefault wether it should display the default value when called with the #getUsage method
     */
    optional(fallback?: any, displayDefault = true) {
      this.displayDefault = displayDefault
      this.default = fallback
      this.opt = true
      return this
    }

    /** retrieves the default value if it had been set */
    getDefault() {
      return this.default
    }

    /** checks if the Argument has a default value */
    hasDefault() {
      return this.default !== undefined
    }

    /** gets the manual of a command */
    getManual() {
      if (this.isOptional()) {
        if (this.displayDefault && this.hasDefault()) {
          return `[${this.display}=${this.getDefault()}]`
        } else {
          return `[${this.display}]`
        }
      } else {
        return `<${this.display}>`
      }
    }

    /** checks if the Argument is optional */
    isOptional() {
      return this.opt
    }

    /**
     * Sets a name for the argument to identify it later when the command gets dispatched
     * This name will be used when passing the parsed argument to the exec function
     * @param name sets the name of the argument
     * @param display sets a beautified display name which will be used when the getManual command gets executed, if none given it will use the first parameter as display value
     */
    setName(name: string, display?: string) {
      this.display = display === undefined ? name : display
      if (typeof name !== "string") throw new Error("Argument of setName needs to be a string")
      if (name.length < 1) throw new Error("Argument of setName needs to be at least 1 char long")
      if (!name.match(/^[a-z0-9_]+$/i)) throw new Error("Argument of setName should contain only chars A-z, 0-9 and _")
      this.name = name
      return this
    }

    /**
     * Retrieves the name of the Argument
     * @returns retrieves the arguments name
     */
    getName() {
      return this.name
    }


    /** creates new object with argument options */
    static createArgumentLayer(): ArgType {
      return {
        string: new StringArgument(),
        number: new NumberArgument(),
        client: new ClientArgument(),
        rest: new RestArgument(),
        or: new GroupArgument("or"),
        and: new GroupArgument("and")
      }
    }
  }

  class StringArgument extends Argument {

    private regex: RegExp|null = null
    private maxlen: number|null = null
    private minlen: number|null = null
    private whitelistWords: string[]|null = null
    private uppercase: boolean = false
    private lowercase: boolean = false

    /**
     * Validates the given String to the StringArgument
     * @param {string} args the remaining args
     */
    validate(args: string) {
      const argArray = args.split(" ")
      let arg = argArray.shift()||""
      return this.validateString(arg, argArray.join(" "))
    }

    /* validates the given string */
    protected validateString(arg: string, rest: string) {
      if (this.uppercase) arg = arg.toUpperCase()
      if (this.lowercase) arg = arg.toLowerCase()
      if (this.minlen !== null && this.minlen > arg.length) throw new ParseError(`String length not greater or equal! Expected at least ${this.minlen}, but got ${arg.length}`, this)
      if (this.maxlen !== null && this.maxlen < arg.length) throw new ParseError(`String length not less or equal! Maximum ${this.maxlen} chars allowed, but got ${arg.length}`, this)
      if (this.whitelistWords !== null && !this.whitelistWords.includes(arg)) throw new ParseError(`Invalid Input for ${arg}. Allowed words: ${this.whitelistWords.join(", ")}`, this)
      if (this.regex !== null && !this.regex.test(arg)) throw new ParseError(`Regex missmatch, the input '${arg}' did not match the expression ${this.regex.toString()}`, this)
      return [arg, rest]
    }

    /**
     * Matches a regular expression pattern
     * @param regex the regex which should be validated
     */
    match(regex: RegExp) {
      this.regex = regex
      return this
    }

    /**
     * Sets the maximum Length of the String
     * @param len the maximum length of the argument
     */
    max(len: number) {
      this.maxlen = len
      return this
    }

    /**
     * Sets the minimum Length of the String
     * @param len the minimum length of the argument
     */
    min(len: number) {
      this.minlen = len
      return this
    }

    /** converts the input to an upper case string */
    forceUpperCase() {
      this.lowercase = false
      this.uppercase = true
      return this
    }

    /** converts the input to a lower case string */
    forceLowerCase() {
      this.lowercase = true
      this.uppercase = false
      return this
    }

    /**
     * creates a list of available whitelisted words
     * @param words array of whitelisted words
     */
    whitelist(words: string[]) {
      if (!Array.isArray(this.whitelistWords)) this.whitelistWords = []
      this.whitelistWords.push(...words)
      return this
    }
  }


  class RestArgument extends StringArgument {

    /**
     * Validates the given String to the RestArgument
     * @param {string} args the remaining args
     */
    validate(args: string) {
      return super.validateString(args, "")
    }
  }


  class NumberArgument extends Argument {

    private minLen: number|null = null
    private maxLen: number|null = null
    private int: boolean = false
    private forcePositive: boolean = false
    private forceNegative: boolean = false

    /**
     * Validates the given Number to the Object
     * @param args the remaining args
     */
    validate(args: string) {
      const argArray = args.split(" ")
      const arg = argArray.shift() || ""
      const num = parseFloat(arg)
      if (!(/^-?\d+(\.\d+)?$/).test(arg) || isNaN(num)) throw new ParseError(`"${arg}" is not a valid number`, this)
      if (this.minLen !== null && this.minLen > num) throw new ParseError(`Number not greater or equal! Expected at least ${this.minLen}, but got ${num}`, this)
      if (this.maxLen !== null && this.maxLen < num) throw new ParseError(`Number not less or equal! Expected at least ${this.maxLen}, but got ${num}`, this)
      if (this.int && num % 1 !== 0) throw new ParseError(`Given Number is not an Integer! (${num})`, this)
      if (this.forcePositive && num <= 0) throw new ParseError(`Given Number is not Positive! (${num})`, this)
      if (this.forceNegative && num >= 0) throw new ParseError(`Given Number is not Negative! (${num})`, this)
      return [num, argArray.join(" ")]
    }

    /**
     * specifies the minimum value
     * @param min the minimum length of the argument
     */
    min(min: number) {
      this.minLen = min
      return this
    }

    /**
     * specifies the maximum value
     * @param max the maximum length of the argument
     */
    max(max: number) {
      this.maxLen = max
      return this
    }

    /** specifies that the Number must be an integer (no floating point) */
    integer() {
      this.int = true
      return this
    }

    /** specifies that the Number must be a positive Number */
    positive() {
      this.forcePositive = true
      this.forceNegative = false
      return this
    }

    /** specifies that the Number must be a negative Number */
    negative() {
      this.forcePositive = false
      this.forceNegative = true
      return this
    }

  }

  /**
   * Class representing a ClientArgument
   * this Argument is capable to parse a Client UID or a simple UID
   * inside the exec function it will resolve the found uid
   */
  class ClientArgument extends Argument {

    /**
     * Validates and tries to parse the Client from the given input string
     * @param args the input from where the client gets extracted
     */
    validate(args: string) {
      switch (engine.getBackend().toLowerCase()) {
        case "ts3": return this.validateTS3(args)
        case "discord": return this.validateDiscord(args)
        default: throw new Error(`Unknown Backend ${engine.getBackend()}`)
      }
    }

    /**
     * Tries to validate a TeamSpeak Client URL or UID
     * @param args the input from where the client gets extracted
     */
    private validateTS3(args: string) {
      const match = args.match(/^(\[URL=client:\/\/\d*\/(?<url_uid>[/+a-z0-9]{27}=)~.*\].*\[\/URL\]|(?<uid>[/+a-z0-9]{27}=)) *(?<rest>.*)$/i)
      if (!match || !match.groups) throw new ParseError("Client not found!", this)
      return [match.groups.url_uid || match.groups.uid, match.groups.rest]
    }

    /**
     * Tries to validate a Discord Client Name or ID
     * @param args the input from where the client gets extracted
     */
    private validateDiscord(args: string) {
      const match = args.match(/^(<@(?<id>\d{18})>|@(?<name>.*?)#\d{4}) *(?<rest>.*)$/i)
      if (!match || !match.groups) throw new ParseError("Client not found!", this)
      const { id, name, rest } = match.groups
      if (id) {
        return [id, rest]
      } else if (name) {
        const client = backend.getClientByName(name)
        if (!client) throw new ParseError("Client not found!", this)
        return [client.uid().split("/")[1], rest]
      } else {
        throw new ParseError("Client not found!", this)
      }
    }
  }

  /**
   * @name GroupArgument
   */
  class GroupArgument extends Argument {

    private type: GroupArgumentType
    private arguments: Argument[] = []

    constructor(type: GroupArgumentType) {
      super()
      this.type = type
    }

    /**
     * Validates the given String to the GroupArgument
     * @param args the remaining args
     */
    validate(args: string) {
      switch (this.type) {
        case "or": return this.validateOr(args)
        case "and": return this.validateAnd(args)
        default: throw new Error(`got invalid group type '${this.type}'`)
      }
    }

    /**
     * Validates the given string to the "or" of the GroupArgument
     * @param args the remaining args
     */
    private validateOr(args: string) {
      const errors: Error[] = []
      const resolved: Record<string, any> = {}
      const valid = this.arguments.some(arg => {
        try {
          const result = arg.validate(args)
          resolved[arg.getName()] = result[0]
          return (args = result[1].trim(), true)
        } catch (e) {
          errors.push(e)
          return false
        }
      })
      if (!valid) throw new ParseError(`No valid match found`, this)
      return [resolved, args]
    }

    /**
     * Validates the given string to the "and" of the GroupArgument
     * @param args the remaining args
     */
    validateAnd(args: string) {
      const resolved: Record<string, any> = {}
      let error: Error|null = null
      this.arguments.some(arg => {
        try {
          const result = arg.validate(args)
          resolved[arg.getName()] = result[0]
          return (args = result[1].trim(), false)
        } catch (e) {
          error = e
          return true
        }
      })
      if (error !== null) return error
      return [resolved, args]
    }

    /**
     * adds an argument to the command
     * @param arg an argument to add
     */
    addArgument(arg: createArgumentHandler|Argument) {
      if (typeof arg === "function") arg = arg(Argument.createArgumentLayer())
      if (!(arg instanceof Argument)) throw new Error(`Typeof arg should be function or instance of Argument but got ${arg}`)
      this.arguments.push(arg)
      return this
    }
  }

  ////////////////////////////////////////////////////////////
  ////                    Throttle                        ////
  ////////////////////////////////////////////////////////////

  class Throttle implements IThrottle {

    private throttled: Record<string, ThrottleInterface> = {}
    private penalty: number = 1
    private initial: number = 1
    private restore: number = 1
    private tickrate: number = 1000

    /* clears all timers */
    stop() {
      Object.values(this.throttled).forEach(({ timeout }) => clearTimeout(timeout))
      return this
    }

    /**
     * Defines how fast points will get restored
     * @param duration time in ms how fast points should get restored
     */
    tickRate(duration: number) {
      this.tickrate = duration
      return this
    }

    /**
     * The amount of points a command request costs
     * @param amount the amount of points that should be reduduced
     */
    penaltyPerCommand(amount: number) {
      this.penalty = amount
      return this
    }

    /**
     * The Amount of Points that should get restored per tick
     * @param amount the amount that should get restored
     */
    restorePerTick(amount: number) {
      this.restore = amount
      return this
    }

    /**
     * Sets the initial Points a user has at beginning
     * @param {number} initial the Initial amount of Points a user has
     */
    initialPoints(initial: number) {
      this.initial = initial
      return this
    }

    /**
     * Reduces the given points for a Command for the given Client
     * @param client the client which points should be removed
     */
    throttle(client: Client) {
      this.reducePoints(client.uid())
      return this.isThrottled(client)
    }

    /**
     * Restores points from the given id
     * @param {string} id the identifier for which the points should be stored
     * @private
     */
    private restorePoints(id: string) {
      const throttle = this.throttled[id]
      if (throttle === undefined) return
      throttle.points += this.restore
      if (throttle.points >= this.initial) {
        Reflect.deleteProperty(this.throttled, id)
      } else {
        this.refreshTimeout(id)
      }
    }

    /**
     * Resets the timeout counter for a stored id
     * @param id the identifier which should be added
     */
    private refreshTimeout(id: string) {
      if (this.throttled[id] === undefined) return
      clearTimeout(this.throttled[id].timeout)
      // @ts-ignore
      this.throttled[id].timeout = setTimeout(this.restorePoints.bind(this, id), this._tickrate)
      this.throttled[id].next = Date.now() + this.tickrate
    }

    /**
     * Removes points from an id
     * @param id the identifier which should be added
     */
    private reducePoints(id: string) {
      const throttle = this.createIdIfNotExists(id)
      throttle.points -= this.penalty
      this.refreshTimeout(id)
    }

    /**
     * creates the identifier in the throttled object
     * @param id the identifier which should be added
     */
    private createIdIfNotExists(id: string) {
      if (Object.keys(this.throttled).includes(id)) return this.throttled[id]
      this.throttled[id] = { points: this.initial, next: 0, timeout: 0 }
      return this.throttled[id]
    }

    /**
     * Checks if the given Client is affected by throttle limitations
     * @param client the TeamSpeak Client which should get checked
     */
    isThrottled(client: Client) {
      const throttle = this.throttled[client.uid()]
      if (throttle === undefined) return false
      return throttle.points <= 0
    }

    /**
     * retrieves the time in milliseconds until a client can send his next command
     * @param client the client which should be checked
     * @returns returns the time a client is throttled in ms
     */
    timeTillNextCommand(client: Client) {
      if (this.throttled[client.uid()] === undefined) return 0
      return this.throttled[client.uid()].next - Date.now()
    }
  }

  ////////////////////////////////////////////////////////////
  ////                    COMMAND                         ////
  ////////////////////////////////////////////////////////////

  abstract class BaseCommand {

    protected collector: Collector
    protected permissionHandler: permissionHandler[] = []
    protected execHandler: execHandler[] = []
    protected prefix: string = ""
    protected helpText: string = ""
    protected manualTexts: string[] = []
    protected name: string
    protected enabled: boolean = true
    protected throttle: IThrottle|null = null
    protected availableAlias: string[] = []

    constructor(cmd: string, collector: Collector) {
      this.name = cmd
      this.collector = collector
    }

    abstract getUsage(): string
    abstract hasPermission(client: Client): Promise<boolean>|boolean
    abstract validate(args: string): Record<string, any>
    abstract dispatch(args: string, ev: MessageEvent): void

    /**
     * one or more alias for this command
     * @param alias alias name to add
     */
    alias(...alias: string[]) {
      alias = alias.map(a => a.toLowerCase())
      alias.forEach(a => Collector.isValidCommandName(a))
      this.availableAlias.push(...alias.filter(a => this.collector.getAvailableCommands(a)))
      return this
    }

    /** checks if the command is enabled */
    isEnabled() {
      return this.enabled
    }

    /** enables the current command */
    enable() {
      this.enabled = true
      return this
    }

    /** disables the current command */
    disable() {
      this.enabled = false
      return this
    }

    /** gets the command name without its prefix */
    getCommandName() {
      return this.name
    }

    /** retrieves all registered alias names without prefix */
    getAlias() {
      return this.availableAlias
    }

    /** gets the command name with its prefix */
    getFullCommandName() {
      return `${this.getPrefix()}${this.getCommandName()}`
    }

    /** retrieves all registered alias names with prefix */
    getFullAlias() {
      return this.availableAlias.map(a => `${this.getPrefix()}${a}`)
    }

    /** retrieves all registered command names */
    getCommandNames() {
      return [this.getCommandName(), ...this.getAlias()]
    }

    /** retrieves all registered command names with prefix */
    getFullCommandNames() {
      return [this.getFullCommandName(), ...this.getFullAlias()]
    }

    /** retrieves the help text */
    getHelp() {
      return this.helpText
    }

    /**
     * sets a help text (should be a very brief description)
     * @param {string} text help text
     */
    help(text: string) {
      this.helpText = text
      return this
    }

    /** returns a boolean wether a help text has been set or not */
    hasHelp() {
      return this.helpText !== ""
    }

    /** retrieves the current manual text */
    getManual() {
      return this.manualTexts.join("\r\n")
    }

    /** returns a boolean wether a help text has been set or not */
    hasManual() {
      return this.manualTexts.length > 0
    }

    /**
     * @param prefix the new prefix to set
     */
    forcePrefix(prefix: string) {
      this.prefix = prefix
      return this
    }

    /** gets the current prefix for this command */
    getPrefix() {
      if (this.prefix.length > 0) return this.prefix
      return Collector.getCommandPrefix()
    }

    /**
     * sets a manual text, this function can be called multiple times
     * in order to create a multilined manual text
     * @param {string} text the manual text
     */
    manual(text: string) {
      this.manualTexts.push(text)
      return this
    }

    /**
     * clears the current manual text
     */
    clearManual() {
      this.manualTexts = []
      return this
    }

    /**
     * register an execution handler for this command
     * @param {execHandler} callback gets called whenever the command should do something
     */
    exec(callback: execHandler) {
      this.execHandler.push(callback)
      return this
    }

    /**
     * adds an instance of a throttle class
     * @param {Throttle} throttle adds the throttle instance
     */
    addThrottle(throttle: IThrottle) {
      this.throttle = throttle
      return this
    }

    /** @param client the sinusbot client */
    handleThrottle(client: Client) {
      if (!(this.throttle instanceof Throttle)) return
      if (this.throttle.isThrottled(client)) {
        const time = (this.throttle.timeTillNextCommand(client) / 1000).toFixed(1)
        throw new ThrottleError(`You can use this command again in ${time} seconds!`)
      } else {
        this.throttle.throttle(client)
      }
    }

    /**
     * register a permission handler for this command
     * @param callback gets called whenever the permission for a client gets checked
     */
    checkPermission(callback: permissionHandler) {
      this.permissionHandler.push(callback)
      return this
    }

    /**
     * checks if a client is allowed to use this command
     * this is the low level method to check permissions for a single command
     * @param client sinusbot client to check permissions from
     */
    isAllowed(client: Client) {
      return Promise.all(this.permissionHandler.map(cb => cb(client)))
        .then(res => res.every(r => r))
    }

    /**
     * dispatches a command
     * @param ev
     */
    async dispatchCommand(ev: CommanderTextMessage) {
      if (!(await this.hasPermission(ev.client)))
        throw new PermissionError("no permission to execute this command")
      this.handleThrottle(ev.client)
      this.execHandler.forEach(handle => handle(ev.client, ev.arguments, ev.reply, ev.raw))
    }
  }

  class Command extends BaseCommand {

    private arguments: Argument[] = []

    /**
     * Retrieves the usage of the command with its parameterized names
     * @returns retrieves the complete usage of the command with its argument names
     */
    getUsage() {
      return `${this.getCommandName()} ${this.getArguments().map(arg => arg.getManual()).join(" ")}`
    }

    /**
     * checks if a client should have permission to use this command
     * @param client the client which should be checked
     */
    hasPermission(client: Client) {
      return this.isAllowed(client)
    }

    /**
     * adds an argument to the command
     * @param arg an argument to add
     */
    addArgument(arg: createArgumentHandler|Argument) {
      if (typeof arg === "function") arg = arg(Argument.createArgumentLayer())
      if (!(arg instanceof Argument)) throw new Error(`Typeof arg should be function or instance of Argument but got ${arg}`)
      this.arguments.push(arg)
      return this
    }

    /** retrieves all available arguments */
    getArguments() {
      return this.arguments
    }

    /**
     * Validates the command
     * @param args the arguments from the command which should be validated
     */
    validate(args: string) {
      const { result, errors, remaining } = this.validateArgs(args)
      if (remaining.length > 0) throw new TooManyArgumentsError(`Too many argument!`, errors.shift())
      return result
    }

    /**
     * @param {string} args
     * @param {MessageEvent} ev
     */
    dispatch(args: string, ev: MessageEvent) {
      return this.dispatchCommand({
        ...ev,
        arguments: this.validate(args),
        reply: Collector.getReplyOutput(ev),
        raw: ev
      })
    }

    /**
     * Validates the given input string to all added arguments
     * @param {string} args the string which should get validated
     */
    validateArgs(args: string) {
      args = args.trim()
      const result: Record<string, any> = {}
      const errors: ParseError[] = []
      this.getArguments().forEach(arg => {
        try {
          const [val, rest] = arg.validate(args)
          result[arg.getName()] = val
          return args = rest.trim()
        } catch (e) {
          if (e instanceof ParseError && arg.isOptional()) {
            result[arg.getName()] = arg.getDefault()
            return errors.push(e)
          }
          throw e
        }
      })
      return { result, remaining: args, errors }
    }

  }


  class CommandGroup extends BaseCommand {

    commands: Command[] = []

    /**
     * Retrieves the usage of the command with its parameterized names
     * @returns retrieves the complete usage of the command with its argument names
     */
    getUsage() {
      return `${this.getFullCommandName()} ${this.commands.map(cmd => cmd.getCommandName()).join("|")}`
    }

    /* not implemented and required here */
    validate() {
      return {}
    }

    /**
     * checks if a client should have permission to use this command
     * @param client the client which should be checked
     */
    async hasPermission(client: Client) {
      if (!await this.isAllowed(client)) return false
      if (this.execHandler.length > 0) return true
      return (await Promise.all(this.commands.map(cmd => cmd.hasPermission(client)))).some(result => result)
    }

    /**
     * Adds a new sub Commmand to the group
     * @param name the sub command name which should be added
     */
    addCommand(name: string) {
      name = name.toLowerCase()
      if (!Collector.isValidCommandName(name)) throw new Error("Can not create a command with length of 0")
      const cmd = new Command(name, this.collector)
      this.commands.push(cmd)
      return cmd
    }

    /**
     * Retrieves a subcommand by its command name
     * @param name the name which should be searched for
     */
    findCommandByName(name: string) {
      name = name.toLowerCase()
      if (name.length === 0) throw new CommandNotFoundError(`No subcommand specified for Command ${this.getFullCommandName()}`)
      const cmd = this.commands.find(c => c.getCommandNames().includes(name))
      if (!cmd) throw new CommandNotFoundError(`Command with name "${name}" has not been found on Command ${this.getFullCommandName()}!`)
      return cmd
    }

    /**
     * retrievel all available subcommands
     * @param client the sinusbot client for which the commands should be retrieved if none has been omitted it will retrieve all available commands
     * @param cmd the command which should be searched for
     */
    getAvailableCommands(client?: Client, cmd?: string) {
      const cmds = this.commands
        .filter(c => c.getCommandName() === cmd || !cmd)
        .filter(c => c.isEnabled())
      if (!client) return Promise.resolve(cmds)
      return Collector.checkPermissions(cmds, client)
    }

    async dispatch(args: string, ev: MessageEvent) {
      const [cmd, ...rest] = args.split(" ")
      if (!await this.hasPermission(ev.client))
        throw new PermissionError("not enough permission to execute this command")
      if (cmd.length === 0) {
        return this.dispatchCommand({
          ...ev,
          arguments: {},
          reply: Collector.getReplyOutput(ev),
          raw: ev
        })
      }
      return this.findCommandByName(cmd).dispatch(rest.join(" "), ev)
    }
  }


  ////////////////////////////////////////////////////////////
  ////                    Collector                       ////
  ////////////////////////////////////////////////////////////

  class Collector {

    commands: BaseCommand[] = []

    /**
     * retrieves the current Command Prefix
     * @returns returns the command prefix
     */
    static getCommandPrefix() {
      const prefix = engine.getCommandPrefix()
      if (typeof prefix !== "string" || prefix.length === 0) return "!"
      return prefix
    }

    /** creates a new Throttle instance */
    static createThrottle() {
      return new Throttle()
    }

    /**
     * retrieves the correct reply chat from where the client has sent the message
     * @param {Message} event
     * @returns {(msg: string) => void}
     */
    static getReplyOutput({ mode, client, channel }: MessageEvent) {
      switch (mode) {
        case 1: return client.chat.bind(client)
        case 2: return channel.chat.bind(channel)
        case 3: return backend.chat.bind(backend)
        default: return (msg: string) => debug(DEBUG.WARNING)(`WARN no reply channel set for mode ${mode}, message "${msg}" not sent!`)
      }
    }

    /** checks the permissions from a set of commands */
    static async checkPermissions(commands: BaseCommand[], client: Client) {
      const result = await Promise.all(commands.map(cmd => cmd.hasPermission(client)))
      return commands.filter((_, i) => result[i])
    }

    /** checks if the command name is valid */
    static isValidCommandName(name: string) {
      if (typeof name !== "string") throw new Error("Expected a string as command name!")
      if (name.length < 1) throw new Error(`Command should have a minimum length of 1!`)
      if ((/\s/).test(name)) throw new Error(`Command "${name}" should not contain spaces!`)
      return true
    }

    /** get all available commands from its command string */
    getAvailableCommands(name: string) {
      name = name.toLowerCase()
      return this.commands
        .filter(cmd => cmd.isEnabled())
        .filter(cmd => cmd.getCommandNames().includes(name))
    }

    /** retrieves all available permissions for a certain client */
    getAvailableCommandsByPermission(client: Client) {
      return Collector.checkPermissions(
        this.commands.filter(cmd => cmd.isEnabled()),
        client
      )
    }

    /**
     * Searches for one or multiple enabled commands with its prefix
     * @param name the command with its prefix
     * @returns {BaseCommand[]} returns an array of found commands
     */
    getAvailableCommandsWithPrefix(name: string) {
      return this.commands
        .filter(cmd => cmd.isEnabled())
        .filter(cmd => cmd.getFullCommandNames().includes(name.toLowerCase()))
    }

    /** checks if a command is a possible command string */
    isPossibleCommand(text:string) {
      if (text.startsWith(Collector.getCommandPrefix())) return true
      return this.commands.some(cmd => cmd.getFullCommandNames().includes(text.split(" ")[0]))
    }

    /**
     * creates a new command
     * @param name the name of the command
     */
    registerCommand(name: string) {
      name = name.toLowerCase()
      if (!Collector.isValidCommandName(name))
        throw new Error("Can not create a command with length of 0")
      const cmd = new Command(name, this)
      this.commands.push(cmd)
      return cmd
    }

    /**
     * creates a new command
     * @param name the name of the command
     */
    registerCommandGroup(name: string) {
      name = name.toLowerCase()
      if (!Collector.isValidCommandName(name))
        throw new Error("Can not create a command with length of 0")
      const cmd = new CommandGroup(name, this)
      this.commands.push(cmd)
      return cmd
    }

    /**
     * checks if the command string is save to register as a new command
     * this function basically checks if there is no other command named with
     * throws an error when Collector#validateCommandName errors
     * returns false when this command has been already registered
     * returns true when this is a completely unused command
     */
    isSaveCommand(cmd: string) {
      cmd = cmd.toLowerCase()
      Collector.isValidCommandName(cmd)
      if (this.getAvailableCommands(cmd).length > 0) return false
      return true
    }
  }

  ////////////////////////////////////////////////////////////
  ////                    Logic                           ////
  ////////////////////////////////////////////////////////////

  /** @name collector */
  const collector = new Collector()

  collector.registerCommand("help")
    .help("Displays this text")
    .manual(`Displays a list of useable commands`)
    .manual(`you can search/filter for a specific commands by adding a keyword`)
    .addArgument(arg => arg.string.setName("filter").min(1).optional())
    .exec(async (client, { filter }, reply) => {
      const fixLen = (str: string, len: number) => str + Array(len - str.length).fill(" ").join("")
      let length = 0
      const cmds = (await collector.getAvailableCommandsByPermission(client))
        .filter(cmd => cmd.hasHelp())
        .filter(cmd => !filter ||
          cmd.getCommandName().match(new RegExp(filter, "i")) ||
          cmd.getHelp().match(new RegExp(filter, "i")))
      reply(`${format.bold(cmds.length.toString())} Commands found:`)
      const commands: string[][] = []
      await Promise.all(cmds.map(async cmd => {
        if (cmd instanceof CommandGroup) {
          if (cmd.getFullCommandName().length > length) length = cmd.getFullCommandName().length
          ;(await cmd.getAvailableCommands(client)).forEach(sub => {
            if (cmd.getFullCommandName().length + sub.getCommandName().length + 1 > length)
              length = cmd.getFullCommandName().length + sub.getCommandName().length + 1
            commands.push([`${cmd.getFullCommandName()} ${sub.getCommandName()}`, sub.getHelp()])
          })
        } else {
          if (cmd.getFullCommandName().length > length) length = cmd.getFullCommandName().length
          commands.push([cmd.getFullCommandName(), cmd.getHelp()])
        }
      }))
      switch (engine.getBackend()) {
        case "discord":
          return commands
            .map(([cmd, help]) => `${fixLen(cmd, length)}  ${help}`)
            .reduce((acc, curr) => {
              if (acc[acc.length - 1].length + acc.join("\n").length + 6 >= 2000) {
                acc[acc.length] = [curr]
              } else {
                acc[acc.length - 1].push(curr)
              }
              return acc
            }, <string[][]>[[]])
            .forEach(lines => reply(format.code(lines.join("\n"))))
        default:
        case "ts3":
          return commands
            .map(([cmd, help]) => `${format.bold(cmd)} ${help}`)
            .reduce((acc, curr) => {
              if (acc[acc.length - 1].length + acc.join("\n").length + 2 >= 8192) {
                acc[acc.length] = [curr]
              } else {
                acc[acc.length - 1].push(curr)
              }
              return acc
            }, <string[][]>[[]])
            .forEach(lines => reply(`\n${lines.join("\n")}`))
      }
    })

  //creates the man command
  collector.registerCommand("man")
    .help("Displays detailed help about a command if available")
    .manual(`Displays detailed usage help for a specific command`)
    .manual(`Arguments with Arrow Brackets (eg. < > ) are mandatory arguments`)
    .manual(`Arguments with Square Brackets (eg. [ ] ) are optional arguments`)
    .addArgument(arg => arg.string.setName("command").min(1))
    .addArgument(arg => arg.string.setName("subcommand").min(1).optional(false, false))
    .exec(async (client, { command, subcommand }, reply) => {
      const getManual = (cmd: BaseCommand) => {
        if (cmd.hasManual()) return cmd.getManual()
        if (cmd.hasHelp()) return cmd.getHelp()
        return "No manual available"
      }
      const cmds = await Collector.checkPermissions(collector.getAvailableCommands(command), client)
      if (cmds.length === 0) return reply(`No command with name ${format.bold(command)} found! Did you misstype the command?`)
      cmds.forEach(async cmd => {
        if (cmd instanceof CommandGroup) {
          if (subcommand) {
            (await cmd.getAvailableCommands(client, subcommand)).forEach(sub => {
              reply(`\n${format.bold("Usage:")} ${cmd.getFullCommandName()} ${sub.getUsage()}\n${getManual(sub)}`)
            })
          } else {
            reply(`${format.bold(cmd.getFullCommandName())} - ${getManual(cmd)}`)
            ;(await cmd.getAvailableCommands(client)).forEach(sub => {
              reply(`${format.bold(`${cmd.getFullCommandName()} ${sub.getUsage()}`)} - ${sub.getHelp()}`)
            })
          }
        } else {
          let response = `\nManual for command: ${format.bold(cmd.getFullCommandName())}\n${format.bold("Usage:")} ${cmd.getUsage()}\n${getManual(cmd)}`
          if (cmd.getAlias().length > 0) response += `\n${format.bold("Alias")}: ${cmd.getAlias()}`
          reply(response)
        }
      })
    })



  if (engine.getBackend() === "discord") {
    //discord message handler
    event.on("message", ev => {
      let author = ev.author()
      if (!author) {
        const id = ev.authorID()
        const guild = backend.getBotClientID().split("/")[0]
        const clid = `${guild}/${id}`
        if (id) {
          author = backend.getClientByID(clid)
        } else {
          debug(DEBUG.VERBOSE)("authorID is undefined")
        }
        if (!author) {
          debug(DEBUG.WARNING)(`could not get author with ID=${id}; replacing client with workaround`)
          //simulate the basic functionality of a client object
          author = {
            chat: str => ev.reply(str),
            isSelf: () => false,
            id: () => clid,
            uid: () => clid,
            uniqueId: () => clid,
            //@ts-ignore
            uniqueID: () => clid,
            DBID: () => clid,
            databaseID: () => clid,
            databaseId: () => clid,
            type: () => 1,
            getURL: () => `<@${id}>`,
            name: () => `unknown (ID: ${id})`,
            nick: () => `unknown (ID: ${id})`,
            phoneticName: () => '',
            description: () => '',
            getServerGroups: () => [],
            getChannelGroup: () => null!,
            getChannels: () => [],
            getAudioChannel: () => null!,
            equals: (client: Client) => {
              const uid = client.uid().split("/")
              return (uid.length === 2) ? uid[2] === id : client.uid() === clid
            }
          }
        }
      }
      messageHandler({
        text: ev.content(),
        channel: ev.channel(),
        client: author,
        mode: ev.guildID() ? 2 : 1,
        message: ev
      })
    })
  } else {
    //teamspeak message handler
    event.on("chat", messageHandler)
  }

  /* handles chat/message events */
  function messageHandler(ev: MessageEvent) {
    if (typeof engine.getIgnoreCommandsFromPrivateChat === "function") {
      //check ignore private chat
      if (ev.mode === 1 && engine.getIgnoreCommandsFromPrivateChat())
        return debug(DEBUG.VERBOSE)("ignoring private chat due to sinusbot instance settings")
      //check ignore channel chat
      if (ev.mode === 2 && engine.getIgnoreCommandsFromChannelChat())
        return debug(DEBUG.VERBOSE)("ignoring channel chat due to sinusbot instance settings")
      //check ignore server chat
      if (ev.mode === 3 && engine.getIgnoreCommandsFromServerChat())
        return debug(DEBUG.VERBOSE)("ignoring server chat due to sinusbot instance settings")
    }
    //do not do anything when the client is undefined
    if (!ev.client) return debug(DEBUG.WARNING)("client is undefined")
    //do not do anything when the bot sends a message
    if (ev.client.isSelf()) return debug(DEBUG.VERBOSE)("Will not handle messages from myself")
    //check if it is a possible command
    if (!collector.isPossibleCommand(ev.text)) return debug(DEBUG.VERBOSE)("No possible valid command found!")
    //get the basic command with arguments and command splitted
    const match = ev.text.match(new RegExp(`^(?<command>\\S*)\\s*(?<args>.*)\\s*$`, "s"))
    if (!match || !match.groups) throw new Error(`command regex missmatch for '${ev.text}'`)
    const { command, args } = match.groups
    //check if command exists
    const commands = collector.getAvailableCommandsWithPrefix(command)
    if (commands.length === 0) {
      //depending on the config setting return without error
      if (NOT_FOUND_MESSAGE !== "0") return
      //send the not found message
      return Collector.getReplyOutput(ev)(`There is no enabled command named ${format.bold(command.toLowerCase())}, check ${format.bold(`${Collector.getCommandPrefix()}help`)} to get a list of available commands!`)
    }
    //handle every available command, should actually be only one command
    commands.forEach(async cmd => {
      const start = Date.now()
      try {
        debug(DEBUG.INFO)(`${ev.client.name()} (${ev.client.uid()}) used ${cmd.getFullCommandName()}`)
        //dispatches the cmd, this will
        // - check for permissions
        // - parse the arguments
        // - dispatch the command
        await cmd.dispatch(args, ev)
        debug(DEBUG.VERBOSE)(`Command "${cmd.getFullCommandName()}" finnished successfully after ${Date.now() - start}ms`)
      //catch errors, parsing errors / permission errors or anything else
      } catch (e) {
        debug(DEBUG.VERBOSE)(`Command "${cmd.getFullCommandName()}" failed after ${Date.now() - start}ms`)
        const reply = Collector.getReplyOutput(ev)
        //Handle Command not found Exceptions for CommandGroups
        let response = (engine.getBackend() === "ts3" ? "\n" : "")
        if (e instanceof CommandNotFoundError) {
          response += `${e.message}\n`
          response += `For Command usage see ${format.bold(`${Collector.getCommandPrefix()}man ${cmd.getCommandName()}`)}\n`
          reply(response)
        } else if (e instanceof PermissionError) {
          debug(DEBUG.INFO)(`${ev.client.name()} (${ev.client.uid()}) is missing permissions for ${cmd.getFullCommandName()}`)
          response += `You do not have permissions to use this command!\n`
          response += `To get a list of available commands see ${format.bold(`${Collector.getCommandPrefix()}help`)}`
          reply(response)
        } else if (e instanceof ParseError) {
          response += `Invalid Command usage! For Command usage see ${format.bold(`${Collector.getCommandPrefix()}man ${cmd.getCommandName()}`)}\n`
          reply(response)
        } else if (e instanceof ThrottleError) {
          reply(e.message)
        } else if (e instanceof TooManyArgumentsError) {
          response += `Too many Arguments received for this Command!\n`
          if (e.parseError) {
            response += `Argument parsed with an error ${format.bold(e.parseError.argument.getManual())}\n`
            response += `Returned with ${format.bold(e.parseError.message)}\n`
          }
          response += `Invalid Command usage! For Command usage see ${format.bold(`${Collector.getCommandPrefix()}man ${cmd.getCommandName()}`)}`
          reply(response)
        } else {
          reply("An unhandled exception occured, check the sinusbot logs for more informations")
          const match = e.stack.match(new RegExp("^(?<type>\\w+): *(?<msg>.+?)\\s+(at .+?\\(((?<script>\\w+):(?<line>\\d+):(?<row>\\d+))\\))", "s"))
          if (match) {
            const { type, msg, script, line, row } = match.groups
            debug(DEBUG.ERROR)(`Unhandled Script Error in Script "${script.endsWith(".js") ? script : `${script}.js`}" on line ${line} at index ${row}`)
            debug(DEBUG.ERROR)(`${type}: ${msg}`)
            debug(DEBUG.VERBOSE)(e.stack)
          } else {
            debug(DEBUG.ERROR)("This is _probably_ an Error with a Script which is using command.js!")
            debug(DEBUG.ERROR)(e.stack)
          }
        }
      }
    })
  }


  ////////////////////////////////////////////////////////////
  ////                    EXPORTS                         ////
  ////////////////////////////////////////////////////////////

  /**
   * creates a new CommandsCommand Instance with the given Command Name
   * @param cmd the command which should be added
   * @returns the created CommandGroup instance
   */
  function createCommandGroup(cmd: string) {
    if (!collector.isSaveCommand(cmd)) {
      debug(DEBUG.WARNING)(`WARNING there is already a command with name '${cmd}' enabled!`)
      debug(DEBUG.WARNING)(`command.js may work not as expected!`)
    }
    debug(DEBUG.VERBOSE)(`registering commandGroup '${cmd}'`)
    return collector.registerCommandGroup(cmd)
  }

  /**
   * creates a new Command Instance with the given Command Name
   * @param cmd the command which should be added
   * @returns the created Command
   */
  function createCommand(cmd: string) {
    if (!collector.isSaveCommand(cmd)) {
      debug(DEBUG.WARNING)(`WARNING there is already a command with name '${cmd}' enabled!`)
      debug(DEBUG.WARNING)(`command.js may work not as expected!`)
    }
    debug(DEBUG.VERBOSE)(`registering command '${cmd}'`)
    return collector.registerCommand(cmd)
  }

  /**
   * Creates a new Argument Instance
   * @param type the argument type which should be created
   * @returns returns the created Argument
   */
  function createArgument(type: keyof ArgType) {
    const arg = Argument.createArgumentLayer()[type]
    if (!(arg instanceof Argument))
      throw new Error(`Argument type not found! Available Arguments: ${Object.keys(Argument.createArgumentLayer()).join(", ")}`)
    return arg
  }

  /**
   * creates a new Argument Instance
   * @param type the argument type which should be created either "or" or "and" allowed
   * @returns the created Group Argument
   */
  function createGroupedArgument(type: GroupArgumentType) {
    if (!Object.values(["or", "and"]).includes(type))
      throw new Error(`Unexpected GroupArgument type, expected one of ["or", "and"] but got ${type}!`)
    return new GroupArgument(type)
  }

  /**
   * retrieves the current Command Prefix
   * @returns returns the command prefix
   */
  function getCommandPrefix() {
    return Collector.getCommandPrefix()
  }

  /**
   * creates a new Throttle Instance
   * @returns the created Throttle
   */
  function createThrottle() {
    return Collector.createThrottle()
  }

  /**
   * retrieves the semantic version of this script
   * @returns the semantic version of this script
   */
  function getVersion() {
    return version
  }

  module.exports = {
    createCommandGroup,
    createCommand,
    createArgument,
    createGroupedArgument,
    getCommandPrefix,
    createThrottle,
    getVersion,
    collector
  }
})