///<reference path="./node_modules/sinusbot-scripting-engine/tsd/types.d.ts" />

/**
 * @typedef CommanderTextMessage
 * @property {function} reply function to reply back
 * @property {Client} invoker the client which invoked the command
 * @property {Record<string, any>} arguments arguments from the command
 * @property {string} raw raw message
 */

/**
 * callback for the command event
 * @callback runHandler
 * @param {CommanderTextMessage} event
 */

/**
 * callback for the command event
 * @callback permissionHandler
 * @param {Client} invoker
 */

/**
 * callback for the command event
 * @callback createArgumentHandler
 * @param {ArgType} arg
 * @returns {Argument}
 */

 /**
  * @typedef ArgType
  * @property {StringArgument} string
  * @property {NumberArgument} number
  * @property {ClientArgument} client
  * @property {RestArgument} rest
  * @property {GroupArgument} or
  * @property {GroupArgument} and
  */




registerPlugin({
  name: "Command",
  description: "Library to handle and manage commands",
  version: "1.4.0",
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
   * @param {number} level
   * @return {(mode: number) => (...args: any[]) => void}
   */
  function DEBUG(level) {
    /**
     * @param {number} mode the loglevel to log
     * @param {number[]} args data to log
     */
    const logger = (mode, ...args) => {
      if (mode > level) return
      engine.log(...args)
    }

    return mode => logger.bind(null, mode)
  }
  DEBUG.VERBOSE = 3
  DEBUG.INFO = 2
  DEBUG.WARNING = 1
  DEBUG.ERROR = 0
  const debug = DEBUG(parseInt(DEBUGLEVEL, 10))

  ////////////////////////////////////////////////////////////
  ////                   EXCEPTIONS                       ////
  ////////////////////////////////////////////////////////////

  /** class representing a CommandDisabledError */
  class CommandDisabledError extends Error {
    /** @param {string} err */
    constructor(err) {
      super(err)
    }
  }

  /** class representing a ThrottleError */
  class ThrottleError extends Error {
    /** @param {string} err  */
    constructor(err) {
      super(err)
    }
  }

  /** class representing a TooManyArguments */
  class TooManyArgumentsError extends Error {
    /**
     * @param {string} err
     * @param {ParseError} parseError
     */
    constructor(err, parseError) {
      super(err)
      this.parseError = parseError
    }
  }

  /**
   * class representing a ParseError
   * gets thrown when an Argument has not been parsed successful
   */
  class ParseError extends Error {
    /**
     * @param {string} err
     * @param {Argument} argument
     */
    constructor(err, argument) {
      super(err)
      this.argument = argument
    }
  }

  /** class representing a SubCommandNotFound */
  class SubCommandNotFoundError extends Error {
    /** @param {string} err */
    constructor(err) {
      super(err)
    }
  }

  /** class representing a PermissionError */
  class PermissionError extends Error {
    /**  @param {string} err */
    constructor(err) {
      super(err)
    }
  }


  ////////////////////////////////////////////////////////////
  ////                  ARGUMENTS                         ////
  ////////////////////////////////////////////////////////////

  class Argument {

    constructor() {
      /** @type {boolean} */
      this._optional = false
      /** @type {string} */
      this._name = "_"
      /** @type {string} */
      this._display = "_"
      /** @type {boolean} */
      this._displayDefault = true
      /** @type {any} */
      this._default = undefined
    }
  
    /**
     * @abstract
     * @param {string} args
     * @returns {any[]}
     */
    validate(args) {
      throw new Error("not implemented")
    }
  
    /**
     * Sets an Argument as optional
     * if the argument has not been parsed successful it will use the first argument which has been given inside this method
     * @param {any} [fallback] the default value which should be set if this parameter has not been found
     * @param {boolean} [displayDefault] wether it should display the default value when called with the #getUsage method
     */
    optional(fallback, displayDefault = true) {
      this._displayDefault = displayDefault
      this._default = fallback
      this._optional = true
      return this
    }
  
    /** retrieves the default value if it had been set */
    getDefault() {
      return this._default
    }
  
    /** checks if the Argument has a default value */
    hasDefault() {
      return this._default !== undefined
    }
  
    /** gets the manual of a command */
    getManual() {
      if (this.isOptional()) {
        if (this._displayDefault && this.hasDefault()) {
          return `[${this._display}=${this.getDefault()}]`
        } else {
          return `[${this._display}]`
        }
      } else {
        return `<${this._display}>`
      }
    }
  
    /** checks if the Argument is optional */
    isOptional() {
      return this._optional
    }
  
    /**
     * Sets a name for the argument to identify it later when the command gets dispatched
     * This name will be used when passing the parsed argument to the exec function
     * @param {string} name sets the name of the argument
     * @param {string} [display] sets a beautified display name which will be used when the getManual command gets executed, if none given it will use the first parameter as display value
     */
    setName(name, display) {
      this._display = display === undefined ? name : display
      if (typeof name !== "string") throw new Error("Argument of setName needs to be a string")
      if (name.length < 1) throw new Error("Argument of setName needs to be at least 1 char long")
      if (!name.match(/^[a-z0-9_]+$/i)) throw new Error("Argument of setName should contain only chars A-z, 0-9 and _")
      this._name = name
      return this
    }
  
    /**
     * Retrieves the name of the Argument
     * @returns {string} retrieves the arguments name
     */
    getName() {
      return this._name
    }
  }


  ////////////////////////////////////////////////////////////
  ////                    COMMAND                         ////
  ////////////////////////////////////////////////////////////

  class BaseCommand {

    /**
     * @param {string} cmd 
     */
    constructor(cmd) {
      /** @type {permissionHandler[]} */
      this._permissionHandler = []
      /** @type {runHandler[]} */
      this._runHandler = []
      /** @type {string} */
      this._prefix =""
      /** @type {string} */
      this._help = ""
      /** @type {string[]} */
      this._manual = []
      /** @type {string} */
      this._name = cmd
      /** @type {boolean} */
      this._enabled = true
      /** @type {Throttle} */
      this._throttle = null
    }
  
    
    /**
     * @abstract
     * @returns {string}
     */
    getUsage() {
      throw new Error("not implemented")
    }

    /**
     * @abstract
     * @param {Client} client 
     * @returns {Promise<boolean>}
     */
    hasPermission(client) {
      throw new Error("not implemented")
    }

    /**
     * @abstract
     * @param {string} args
     * @returns {Record<string, any>}
     */
    validate(args) {
      throw new Error("not implemented")
    }
    
    /**
     * 
     * @param {string} args
     * @param {CommanderTextMessage} ev 
     */
    handleRequest(args, ev) {
      throw new Error("not implemented")
    }
  
    /** checks if the command is enabled */
    isEnabled() {
      return this._enabled
    }
  
    /**
     * enables or disables a command
     * @param {boolean} status wether the command should be enabled or disabled
     */
    enable(status) {
      this._enabled = status
      return this
    }
  
    /** gets the command name without its prefix */
    getCommandName() {
      return this._name
    }
  
    /** gets the command name with its prefix */
    getFullCommandName() {
      return `${this.getPrefix()}${this.getCommandName()}`
    }
  
    /** retrieves the help text */
    getHelp() {
      return this._help
    }
  
    /**
     * sets a help text (should be a very brief description)
     * @param {string} text help text
     */
    setHelp(text) {
      this._help = text
      return this
    }
  
    /** returns a boolean wether a help text has been set or not */
    hasHelp() {
      return this._help !== ""
    }
  
    /** retrieves the current manual text */
    getManual() {
      return this._manual.join("\r\n")
    }
  
    /** returns a boolean wether a help text has been set or not */
    hasManual() {
      return this._manual.length > 0
    }
  
    /**
     * sets a prefix for this command
     * should only used in specific cases
     * by default the prefix gets inherited from its Commander
     * @param {string} prefix the new prefix for this command
     */
    setPrefix(prefix) {
      this._prefix = prefix
      return this
    }
  
    /** gets the current prefix for this command */
    getPrefix() {
      if (this._prefix.length > 0) return this._prefix
      return getCommandPrefix()
    }
  
    /**
     * sets a manual text, this function can be called multiple times
     * in order to create a multilined manual text
     * @param {string} text the manual text
     */
    setManual(text) {
      this._manual.push(text)
      return this
    }
  
    /**
     * clears the current manual text
     */
    clearManual() {
      this._manual = []
      return this
    }
  
    /**
     * register an execution handler for this command
     * @param {runHandler} callback gets called whenever the command should do something
     */
    run(callback) {
      this._runHandler.push(callback)
      return this
    }
  
    /**
     * adds an instance of a throttle class
     * @param {Throttle} throttle adds the throttle instance
     */
    addThrottle(throttle) {
      this._throttle = throttle
      return this
    }
  
    /**
     * 
     * @param {Client} client the sinusbot client
     */
    _handleThrottle(client) {
      if (!(this._throttle instanceof Throttle)) return
      if (this._throttle.isThrottled(client)) {
        const time = (this._throttle.timeTillNextCommand(client) / 1000).toFixed(1)
        throw new ThrottleError(`You can use this command again in ${time} seconds!`)
      } else {
        this._throttle.throttle(client)
      }
    }
  
    /**
     * register a permission handler for this command
     * @param {permissionHandler} callback gets called whenever the permission for a client gets checked
     */
    checkPermission(callback) {
      this._permissionHandler.push(callback)
      return this
    }
  
    /**
     * checks if a client is allowed to use this command
     * @param {Client} client sinusbot client to check permissions from
     */
    isAllowed(client) {
      return Promise.all(this._permissionHandler.map(cb => cb(client)))
        .then(res => res.every(r => r))
    }
  
    /**
     * dispatches a command
     * @private
     * @param {CommanderTextMessage} ev 
     */
    _dispatchCommand(ev) {
      this._handleThrottle(ev.invoker)
      this._runHandler.forEach(handle => handle({...ev}))
    }
  }

  class Command extends BaseCommand {

    /**
     * @param {string} cmd 
     */
    constructor(cmd) {
      super(cmd)
      /** @type {Argument[]} */
      this._arguments = []
    }

    /**
     * Retrieves the usage of the command with its parameterized names
     * @returns retrieves the complete usage of the command with its argument names
     */
    getUsage() {
      return `${this.getCommandName()} ${this.getArguments().map(arg => arg.getManual()).join(" ")}`
    }

    /**
     * checks if a client should have permission to use this command
     * @param {Client} client the client which should be checked
     */
    hasPermission(client) {
      return this.isAllowed(client)
    }

    /**
     * adds an argument to the command
     * @param {createArgumentHandler|Argument} arg an argument to add
     */
    addArgument(arg) {
      if (typeof arg === "function") arg = arg(Argument.createArgumentLayer())
      if (!(arg instanceof Argument)) throw new Error(`Typeof arg should be function or instance of Argument but got ${arg}`)
      this._arguments.push(arg)
      return this
    }

    /** retrieves all available arguments */
    getArguments() {
      return this._arguments
    }

    /**
     * Validates the command
     * @param {string} args the arguments from the command which should be validated
     */
    validate(args) {
      const { result, errors, remaining } = this.validateArgs(args)
      if (remaining.length > 0) throw new TooManyArgumentsError(`Too many argument!`, errors.length > 0 ? errors[0] : undefined)
      return result
    }

    /**
     * @param {string} args 
     * @param {CommanderTextMessage} ev 
     */
    handleRequest(args, ev) {
      this._dispatchCommand({ ...ev, arguments: this.validate(args) })
    }

    /**
     * Validates the given input string to all added arguments
     * @param {string} args the string which should get validated
     */
    validateArgs(args) {
      args = args.trim()
      /** @type {Record<string, any>} */
      const resolved = {}
      /** @type {ParseError[]} */
      const errors = []
      this.getArguments().forEach(arg => {
        try {
          const [val, rest] = arg.validate(args)
          resolved[arg.getName()] = val
          return args = rest.trim()
        } catch (e) {
          if (e instanceof ParseError && arg.isOptional()) {
            resolved[arg.getName()] = arg.getDefault()
            return errors.push(e)
          }
          throw e
      }
      })
      return { result: resolved, remaining: args, errors }
    }


    /** 
     * creates new object with argument options
     * @returns {ArgType}
     */
    static createArgumentLayer() {
      return {
        string: new StringArgument(),
        number: new NumberArgument(),
        client: new ClientArgument(),
        rest: new RestArgument(),
        or: new GroupArgument(GroupArgument.Type.OR),
        and: new GroupArgument(GroupArgument.Type.AND),
      }
    }

  }

  
  class StringArgument extends Argument {
    
    constructor() {
      super()
      /** @type {RegExp|null} */
      this._regex = null
      /** @type {number|null} */
      this._maxlen = null
      /** @type {number|null} */
      this._minlen = null
      /** @type {string[]|null} */
      this._whitelist = null
      /** @type {boolean} */
      this._uppercase = false
      /** @type {boolean} */
      this._lowercase = false
    }
  
    /**
     * Validates the given String to the StringArgument
     * @param {string} args the remaining args
     */
    validate(args) {
      const argArray = args.split(" ")
      const str = argArray.shift()
      return this._validate(str||"", argArray.join(" "))
    }
  
    /**
     * Validates the given string to the StringArgument params
     * @protected
     * @param {string} arg string argument that should be parsed
     * @param {string[]} rest the remaining args
     */
    _validate(arg, ...rest) {
      if (this._uppercase) arg = arg.toUpperCase()
      if (this._lowercase) arg = arg.toLowerCase()
      if (this._minlen !== null && this._minlen > arg.length) throw new ParseError(`String length not greater or equal! Expected at least ${this._minlen}, but got ${arg.length}`, this)
      if (this._maxlen !== null && this._maxlen < arg.length) throw new ParseError(`String length not less or equal! Maximum ${this._maxlen} chars allowed, but got ${arg.length}`, this)
      if (this._whitelist !== null && !this._whitelist.includes(arg)) throw new ParseError(`Invalid Input for ${arg}. Allowed words: ${this._whitelist.join(", ")}`, this)
      if (this._regex !== null && !this._regex.test(arg)) throw new ParseError(`Regex missmatch, the input '${arg}' did not match the expression ${this._regex.toString()}`, this)
      return [arg, ...rest]
    }
  
    /**
     * Matches a regular expression pattern
     * @param {RegExp} regex the regex which should be validated
     */
    match(regex) {
      this._regex = regex
      return this
    }
  
    /**
     * Sets the maximum Length of the String
     * @param {number} len the maximum length of the argument
     */
    maximum(len) {
      this._maxlen = len
      return this
    }
  
    /**
     * Sets the minimum Length of the String
     * @param {number} len the minimum length of the argument
     */
    minimum(len) {
      this._minlen = len
      return this
    }
  
  
    /** converts the input to an upper case string */
    forceUpperCase() {
      this._lowercase = false
      this._uppercase = true
      return this
    }
  
  
    /** converts the input to a lower case string */
    forceLowerCase() {
      this._lowercase = true
      this._uppercase = false
      return this
    }
  
    /**
     * creates a list of available whitelisted words
     * @param {string[]} words array of whitelisted words
     */
    allow(words) {
      if (!Array.isArray(this._whitelist)) this._whitelist = []
      this._whitelist.push(...words)
      return this
    }
  }



  class RestArgument extends StringArgument {

    /**
     * Validates the given String to the RestArgument
     * @param {string} args the remaining args
     */
    validate(args) {
        return super._validate(args, "")
    }
  }



  class NumberArgument extends Argument {

    constructor() {
      super()
      /** @type {number|null} */
      this._min = null
      /** @type {number|null} */
      this._max = null
      /** @type {boolean} */
      this._int = false
      /** @type {boolean} */
      this._forcePositive = false
      /** @type {boolean} */
      this._forceNegative = false
    }
  
    /**
     * Validates the given Number to the Object
     * @param {string} args the remaining args
     */
    validate(args) {
      const argArray = args.split(" ")
      const arg = argArray.shift()|| ""
      const num = parseFloat(arg)
      if (!(/^-?\d+(\.\d+)?$/).test(arg) || isNaN(num)) throw new ParseError(`"${arg}" is not a valid number`, this)
      if (this._min !== null && this._min > num) throw new ParseError(`Number not greater or equal! Expected at least ${this._min}, but got ${num}`, this)
      if (this._max !== null && this._max < num) throw new ParseError(`Number not less or equal! Expected at least ${this._max}, but got ${num}`, this)
      if (this._int && num % 1 !== 0) throw new ParseError(`Given Number is not an Integer! (${num})`, this)
      if (this._forcePositive && num <= 0) throw new ParseError(`Given Number is not Positive! (${num})`, this)
      if (this._forceNegative && num >= 0) throw new ParseError(`Given Number is not Negative! (${num})`, this)
      return [num, argArray.join(" ")]
    }
  
    /**
     * specifies the minimum value
     * @param {number} min the minimum length of the argument
     */
    minimum(min) {
      this._min = min
      return this
    }
  
    /**
     * specifies the maximum value
     * @param {number} max the maximum length of the argument
     */
    maximum(max) {
      this._max = max
      return this
    }
  
    /** specifies that the Number must be an integer (no floating point) */
    integer() {
      this._int = true
      return this
    }
  
    /** specifies that the Number must be a positive Number */
    positive() {
      this._forcePositive = true
      this._forceNegative = false
      return this
    }
  
    /** specifies that the Number must be a negative Number */
    negative() {
      this._forcePositive = false
      this._forceNegative = true
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
     * @param {string} args the input from where the client gets extracted
     */
    validate(args) {
      switch (engine.getBackend()) {
        case "ts3": return this._validateTS3(args)
        case "discord": return this._validateDiscord(args)
        default: throw new Error(`Unknown Backend ${engine.getBackend()}`)
      }
    }

    /**
     * Tries to validate a TeamSpeak Client URL or UID
     * @param {string} args the input from where the client gets extracted
     * @throws {ParseError} An error is thrown when argument is invalid
     */
    _validateTS3(args) {
      const match = args.match(/^(\[URL=client:\/\/\d*\/(?<url_uid>[/+a-z0-9]{27}=)~.*\].*\[\/URL\]|(?<uid>[/+a-z0-9]{27}=)) *(?<rest>.*)$/i)
      if (!match) throw new ParseError("Client not found!", this)
      //@ts-ignore
      return [match.groups.url_uid || match.groups.uid, match.groups.rest]
    }

    /**
     * Tries to validate a Discord Client Name or ID
     * @param {string} args the input from where the client gets extracted
     * @throws {ParseError} An error is thrown when argument is invalid
     */
    _validateDiscord(args) {
      const match = args.match(/^(<@(?<id>\d{18})>|@(?<name>.*?)#\d{4}) *(?<rest>.*)$/i)
      if (!match) throw new ParseError("Client not found!", this)
      /**
       * @typedef 
       */
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
   * retrieves the current Command Prefix
   * @name getCommandPrefix
   * @returns {string} returns the command prefix
   */
  function getCommandPrefix() {
    const prefix = engine.getCommandPrefix()
    if (typeof prefix !== "string" || prefix.length === 0) return "!"
    return prefix
  }

  /**
   * retrieves the semantic version of this script
   * @name getVersion
   * @returns {string} returns the semantic version of this script
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