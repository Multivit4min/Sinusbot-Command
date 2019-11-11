registerPlugin({
  name: "Command",
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
   * @param {number} level
   * @return {(mode: number) => (...args: any[]) => void}
   * @private
   */
  function DEBUG(level) {
    /**
     * @param {number} mode the loglevel to log
     * @param {number[]} args data to log
     * @private
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
  /** @private */
  const debug = DEBUG(parseInt(DEBUGLEVEL, 10))


  ////////////////////////////////////////////////////////////
  ////                     TYPES                          ////
  ////////////////////////////////////////////////////////////

  /**
   * callback for the command event
   * @callback createArgumentHandler
   * @param {ArgType} arg
   * @returns {Argument}
   */

  /**
   * @typedef ArgType
   * @type {object}
   * @property {StringArgument} string
   * @property {NumberArgument} number
   * @property {ClientArgument} client
   * @property {RestArgument} rest
   * @property {GroupArgument} or
   * @property {GroupArgument} and
   */
  // eslint-disable-next-line no-unused-vars
  const ArgType = {}

  /**
   * @ignore
   * @typedef CommanderTextMessage
   * @type {object}
   * @property {(msg: string) => void} reply function to reply back
   * @property {Client} client the client which invoked the command
   * @property {Record<string, any>} arguments arguments from the command
   * @property {Message} raw raw message
   * @property {DiscordMessage} [message]
   */

  /**
   * @ignore
   * @typedef MessageEvent
   * @type {object}
   * @property {Client} client
   * @property {Channel} channel
   * @property {string} text
   * @property {number} mode
   * @property {DiscordMessage} [message]
   */

  /**
   * callback for the command event
   * @callback execHandler
   * @param {Client} invoker
   * @param {Record<string, any>} args
   * @param {(msg: string) => void} reply
   * @param {MessageEvent} event
   */

  /**
   * callback for the command event
   * @callback permissionHandler
   * @param {Client} invoker
   */

  /**
   * @ignore
   * @typedef ThrottleInterface
   * @property {number} points
   * @property {number} next
   * @property {number} timeout
   */


  ////////////////////////////////////////////////////////////
  ////                   EXCEPTIONS                       ////
  ////////////////////////////////////////////////////////////

  /**
   * class representing a ThrottleError
   * @private
   */
  class ThrottleError extends Error {
    /** @param {string} err  */
    constructor(err) {
      super(err)
    }
  }

  /**
   * class representing a TooManyArguments
   * @private
   */
  class TooManyArgumentsError extends Error {
    /**
     * @param {string} err
     * @param {ParseError|undefined} parseError
     */
    constructor(err, parseError) {
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
    /**
     * @param {string} err
     * @param {Argument} argument
     */
    constructor(err, argument) {
      super(err)
      this.argument = argument
    }
  }

  /**
   * class representing a SubCommandNotFoundError
   * @private
   */
  class CommandNotFoundError extends Error {
    /** @param {string} err */
    constructor(err) {
      super(err)
    }
  }

  /**
   * class representing a PermissionError
   * @private
   */
  class PermissionError extends Error {
    /** @param {string} err */
    constructor(err) {
      super(err)
    }
  }


  ////////////////////////////////////////////////////////////
  ////                  ARGUMENTS                         ////
  ////////////////////////////////////////////////////////////

  /**
   * @name Argument
   */
  class Argument {

    constructor() {
      /**
       * @type {boolean}
       * @private
      */
      this._optional = false
      /**
       * @type {string}
       * @private
      */
      this._name = "_"
      /**
       * @type {string}
       * @private
      */
      this._display = "_"
      /**
       * @type {boolean}
       * @private
      */
      this._displayDefault = true
      /**
       * @type {any}
       * @private
      */
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
        or: new GroupArgument("or"),
        and: new GroupArgument("and")
      }
    }
  }

  /**
   * @name StringArgument
   */
  class StringArgument extends Argument {

    constructor() {
      super()
      /**
       * @type {?RegExp}
       * @private
       */
      this._regex = null
      /**
       * @type {?number}
       * @private
       */
      this._maxlen = null
      /**
       * @type {?number}
       * @private
       */
      this._minlen = null
      /**
       * @type {?string[]}
       * @private
       */
      this._whitelist = null
      /**
       * @type {boolean}
       * @private
       */
      this._uppercase = false
      /**
       * @type {boolean}
       * @private
       */
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
    max(len) {
      this._maxlen = len
      return this
    }

    /**
     * Sets the minimum Length of the String
     * @param {number} len the minimum length of the argument
     */
    min(len) {
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
    whitelist(words) {
      if (!Array.isArray(this._whitelist)) this._whitelist = []
      this._whitelist.push(...words)
      return this
    }
  }

  /**
   * @name RestArgument
   */
  class RestArgument extends StringArgument {

    /**
     * Validates the given String to the RestArgument
     * @param {string} args the remaining args
     */
    validate(args) {
      return super._validate(args, "")
    }
  }

  /**
   * @name NumberArgument
   */
  class NumberArgument extends Argument {

    constructor() {
      super()
      /**
       * @type {?number}
       * @private
       */
      this._min = null
      /**
       * @type {?number}
       * @private
       */
      this._max = null
      /**
       * @type {boolean}
       * @private
       */
      this._int = false
      /**
       * @type {boolean}
       * @private
       */
      this._forcePositive = false
      /**
       * @type {boolean}
       * @private
       */
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
    min(min) {
      this._min = min
      return this
    }

    /**
     * specifies the maximum value
     * @param {number} max the maximum length of the argument
     */
    max(max) {
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
   * @name ClientArgument
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
     * @private
     */
    _validateTS3(args) {
      const match = args.match(/^(\[URL=client:\/\/\d*\/(?<url_uid>[/+a-z0-9]{27}=)~.*\].*\[\/URL\]|(?<uid>[/+a-z0-9]{27}=)) *(?<rest>.*)$/i)
      if (!match || !match.groups) throw new ParseError("Client not found!", this)
      return [match.groups.url_uid || match.groups.uid, match.groups.rest]
    }

    /**
     * Tries to validate a Discord Client Name or ID
     * @param {string} args the input from where the client gets extracted
     * @private
     */
    _validateDiscord(args) {
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

    /**
     * @param {"or"|"and"} type
     */
    constructor(type) {
      super()
      /**
       * @type {"or"|"and"}
       * @private
       */
      this._type = type
      /**
       * @type {Argument[]}
       * @private
       */
      this._arguments = []
    }

    /**
     * Validates the given String to the GroupArgument
     * @param {string} args the remaining args
     */
    validate(args) {
      switch (this._type) {
        case "or": return this._validateOr(args)
        case "and": return this._validateAnd(args)
        default: throw new Error(`got invalid group type '${this._type}'`)
      }
    }

    /**
     * Validates the given string to the "or" of the GroupArgument
     * @param {string} args the remaining args
     * @private
     */
    _validateOr(args) {
      /**
       * @type {Error[]}
       * @private
       */
      const errors = []
      /**
       * @type {Record<string, any>}
       * @private
       */
      const resolved = {}
      const valid = this._arguments.some(arg => {
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
     * @param {string} args the remaining args
     * @private
     */
    _validateAnd(args) {
      /**
       * @type {Record<string, any>}
       * @private
       */
      const resolved = {}
      /**
       * @type {?Error}
       * @private
       */
      let error = null
      this._arguments.some(arg => {
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
     * @param {createArgumentHandler|Argument} arg an argument to add
     */
    addArgument(arg) {
      if (typeof arg === "function") arg = arg(Argument.createArgumentLayer())
      if (!(arg instanceof Argument)) throw new Error(`Typeof arg should be function or instance of Argument but got ${arg}`)
      this._arguments.push(arg)
      return this
    }
  }

  ////////////////////////////////////////////////////////////
  ////                    Throttle                        ////
  ////////////////////////////////////////////////////////////

  /**
   * @name Throttle
   */
  class Throttle {

    constructor() {
      /**
       * @type {Record<string, ThrottleInterface>}
       * @private
       */
      this._throttled = {}
      /**
       * @type {number}
       * @private
       */
      this._penalty = 1
      /**
       * @type {number}
       * @private
       */
      this._initial = 1
      /**
       * @type {number}
       * @private
       */
      this._restore = 1
      /**
       * @type {number}
       * @private
       */
      this._tickrate = 1000
    }

    /* clears all timers */
    stop() {
      Object.values(this._throttled).forEach(({ timeout }) => clearTimeout(timeout))
      return this
    }

    /**
     * Defines how fast points will get restored
     * @param {number} duration time in ms how fast points should get restored
     */
    tickRate(duration) {
      this._tickrate = duration
      return this
    }

    /**
     * The amount of points a command request costs
     * @param {number} amount the amount of points that should be reduduced
     */
    penaltyPerCommand(amount) {
      this._penalty = amount
      return this
    }

    /**
     * The Amount of Points that should get restored per tick
     * @param {number} amount the amount that should get restored
     */
    restorePerTick(amount) {
      this._restore = amount
      return this
    }

    /**
     * Sets the initial Points a user has at beginning
     * @param {number} initial the Initial amount of Points a user has
     */
    initialPoints(initial) {
      this._initial = initial
      return this
    }

    /**
     * Reduces the given points for a Command for the given Client
     * @param {Client} client the client which points should be removed
     */
    throttle(client) {
      this._reducePoints(client.uid())
      return this.isThrottled(client)
    }

    /**
     * Restores points from the given id
     * @param {string} id the identifier for which the points should be stored
     * @private
     */
    _restorePoints(id) {
      const throttle = this._throttled[id]
      if (throttle === undefined) return
      throttle.points += this._restore
      if (throttle.points >= this._initial) {
        Reflect.deleteProperty(this._throttled, id)
      } else {
        this._refreshTimeout(id)
      }
    }

    /**
     * Resets the timeout counter for a stored id
     * @param {string} id the identifier which should be added
     * @private
     */
    _refreshTimeout(id) {
      if (this._throttled[id] === undefined) return
      clearTimeout(this._throttled[id].timeout)
      // @ts-ignore
      this._throttled[id].timeout = setTimeout(this._restorePoints.bind(this, id), this._tickrate)
      this._throttled[id].next = Date.now() + this._tickrate
    }

    /**
     * Removes points from an id
     * @param {string} id the identifier which should be added
     * @private
     */
    _reducePoints(id) {
      const throttle = this._createIdIfNotExists(id)
      throttle.points -= this._penalty
      this._refreshTimeout(id)
    }

    /**
     * creates the identifier in the throttled object
     * @param {string} id the identifier which should be added
     * @private
     */
    _createIdIfNotExists(id) {
      if (Object.keys(this._throttled).includes(id)) return this._throttled[id]
      this._throttled[id] = { points: this._initial, next: 0, timeout: 0 }
      return this._throttled[id]
    }

    /**
     * Checks if the given Client is affected by throttle limitations
     * @param {Client} client the TeamSpeak Client which should get checked
     */
    isThrottled(client) {
      const throttle = this._throttled[client.uid()]
      if (throttle === undefined) return false
      return throttle.points <= 0
    }

    /**
     * retrieves the time in milliseconds until a client can send his next command
     * @param {Client} client the client which should be checked
     * @returns returns the time a client is throttled in ms
     */
    timeTillNextCommand(client) {
      if (this._throttled[client.uid()] === undefined) return 0
      return this._throttled[client.uid()].next - Date.now()
    }
  }

  ////////////////////////////////////////////////////////////
  ////                    COMMAND                         ////
  ////////////////////////////////////////////////////////////

  /**
   * @name BaseCommand
   */
  class BaseCommand {

    /**
     * @param {string} cmd
     * @param {Collector} collector
     */
    constructor(cmd, collector) {
      /**
       * @type {Collector}
       * @private
       */
      this._collector = collector
      /**
       * @type {permissionHandler[]}
       * @private
       */
      this._permissionHandler = []
      /**
       * @type {execHandler[]}
       * @private
       */
      this._execHandler = []
      /**
       * @type {string}
       * @private
       */
      this._prefix = ""
      /**
       * @type {string}
       * @private
       */
      this._help = ""
      /**
       * @type {string[]}
       * @private
       */
      this._manual = []
      /**
       * @type {string}
       * @private
       */
      this._name = cmd
      /**
       * @type {boolean}
       * @private
       */
      this._enabled = true
      /**
       * @type {?Throttle}
       * @private
       */
      this._throttle = null
      /**
       * @type {string[]}
       * @private
       */
      this._alias = []
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
     * @abstract
     * @param {string} args
     * @param {MessageEvent} ev
     */
    dispatch(args, ev) {
      throw new Error("not implemented")
    }

    /**
     * one or more alias for this command
     * @param  {...string} alias
     */
    alias(...alias) {
      alias = alias.map(a => a.toLowerCase())
      alias.forEach(a => Collector.isValidCommandName(a))
      this._alias.push(...alias.filter(a => this._collector.getAvailableCommands(a)))
      return this
    }

    /** checks if the command is enabled */
    isEnabled() {
      return this._enabled
    }

    /**
     * enables the current command
     */
    enable() {
      this._enabled = true
      return this
    }

    /**
     * disables the current command
     */
    disable() {
      this._enabled = false
      return this
    }

    /** gets the command name without its prefix */
    getCommandName() {
      return this._name
    }

    /** retrieves all registered alias names without prefix */
    getAlias() {
      return this._alias
    }

    /** gets the command name with its prefix */
    getFullCommandName() {
      return `${this.getPrefix()}${this.getCommandName()}`
    }

    /** retrieves all registered alias names with prefix */
    getFullAlias() {
      return this._alias.map(a => `${this.getPrefix()}${a}`)
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
      return this._help
    }

    /**
     * sets a help text (should be a very brief description)
     * @param {string} text help text
     */
    help(text) {
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
     * @param {string} prefix the new prefix to set
     */
    forcePrefix(prefix) {
      this._prefix = prefix
      return this
    }

    /** gets the current prefix for this command */
    getPrefix() {
      if (this._prefix.length > 0) return this._prefix
      return Collector.getCommandPrefix()
    }

    /**
     * sets a manual text, this function can be called multiple times
     * in order to create a multilined manual text
     * @param {string} text the manual text
     */
    manual(text) {
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
     * @param {execHandler} callback gets called whenever the command should do something
     */
    exec(callback) {
      this._execHandler.push(callback)
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
     * @param {Client} client the sinusbot client
     * @private
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
     * this is the low level method to check permissions for a single command
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
    async _dispatchCommand(ev) {
      if (!(await this.hasPermission(ev.client)))
        throw new PermissionError("no permission to execute this command")
      this._handleThrottle(ev.client)
      this._execHandler.forEach(handle => handle(ev.client, ev.arguments, ev.reply, ev.raw))
    }
  }

  /**
   * @name Command
   */
  class Command extends BaseCommand {

    /**
     * @param {string} cmd
     * @param {Collector} collector
     */
    constructor(cmd, collector) {
      super(cmd, collector)
      /**
       * @type {Argument[]}
       * @private
       */
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
      if (remaining.length > 0) throw new TooManyArgumentsError(`Too many argument!`, errors.shift())
      return result
    }

    /**
     * @param {string} args
     * @param {MessageEvent} ev
     */
    dispatch(args, ev) {
      return this._dispatchCommand({
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
    validateArgs(args) {
      args = args.trim()
      /**
       * @type {Record<string, any>}
       * @private
       */
      const result = {}
      /**
       * @type {ParseError[]}
       * @private
       */
      const errors = []
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

  /**
   * @name CommandGroup
   */
  class CommandGroup extends BaseCommand {

    /**
     * @param {string} cmd
     * @param {Collector} collector
     */
    constructor(cmd, collector) {
      super(cmd, collector)
      /**
       * @type {Command[]}
       * @private
       */
      this._commands = []
    }

    /**
     * Retrieves the usage of the command with its parameterized names
     * @returns retrieves the complete usage of the command with its argument names
     */
    getUsage() {
      return `${this.getFullCommandName()} ${this._commands.map(cmd => cmd.getCommandName()).join("|")}`
    }

    /**
     * checks if a client should have permission to use this command
     * @param {Client} client the client which should be checked
     */
    async hasPermission(client) {
      if (!await this.isAllowed(client)) return false
      if (this._execHandler.length > 0) return true
      return (await Promise.all(this._commands.map(cmd => cmd.hasPermission(client)))).some(result => result)
    }

    /**
     * Adds a new sub Commmand to the group
     * @param {string} name the sub command name which should be added
     */
    addCommand(name) {
      name = name.toLowerCase()
      if (!Collector.isValidCommandName(name)) throw new Error("Can not create a command with length of 0")
      const cmd = new Command(name, this._collector)
      this._commands.push(cmd)
      return cmd
    }

    /**
     * Retrieves a subcommand by its command name
     * @param {string} name the name which should be searched for
     */
    findCommandByName(name) {
      name = name.toLowerCase()
      if (name.length === 0) throw new CommandNotFoundError(`No subcommand specified for Command ${this.getFullCommandName()}`)
      const cmd = this._commands.find(c => c.getCommandNames().includes(name))
      if (!cmd) throw new CommandNotFoundError(`Command with name "${name}" has not been found on Command ${this.getFullCommandName()}!`)
      return cmd
    }

    /**
     * retrievel all available subcommands
     * @param {Client} [client] the sinusbot client for which the commands should be retrieved if none has been omitted it will retrieve all available commands
     * @param {string} [cmd] the command which should be searched for
     */
    getAvailableCommands(client, cmd) {
      const cmds = this._commands
        .filter(c => c.getCommandName() === cmd || !cmd)
        .filter(c => c.isEnabled())
      if (!client) return Promise.resolve(cmds)
      return Collector.checkPermissions(cmds, client)
    }

    /**
     * @param {string} args
     * @param {MessageEvent} ev
     */
    async dispatch(args, ev) {
      const [cmd, ...rest] = args.split(" ")
      if (!await this.hasPermission(ev.client))
        throw new PermissionError("not enough permission to execute this command")
      if (cmd.length === 0) {
        return this._dispatchCommand({
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

  /**
   * @name Collector
   */
  class Collector {

    constructor() {
      /**
       * @type {BaseCommand[]}
       * @private
      */
      this._commands = []
    }

    /**
     * retrieves the current Command Prefix
     * @returns {string} returns the command prefix
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
    static getReplyOutput({ mode, client, channel }) {
      switch (mode) {
        case 1: return client.chat.bind(client)
        case 2: return channel.chat.bind(channel)
        case 3: return backend.chat.bind(backend)
        default: return msg => debug(DEBUG.WARNING)(`WARN no reply channel set for mode ${mode}, message "${msg}" not sent!`)
      }
    }

    /**
     * checks the permissions from a set of commands
     * @param {BaseCommand[]} commands
     * @param {Client} client
     * @returns {Promise<BaseCommand[]>}
     */
    static async checkPermissions(commands, client) {
      const result = await Promise.all(commands.map(cmd => cmd.hasPermission(client)))
      return commands.filter((_, i) => result[i])
    }

    /**
     * checks if the command name is valid
     * @param {string} name
     */
    static isValidCommandName(name) {
      if (typeof name !== "string") throw new Error("Expected a string as command name!")
      if (name.length < 1) throw new Error(`Command should have a minimum length of 1!`)
      if ((/\s/).test(name)) throw new Error(`Command "${name}" should not contain spaces!`)
      return true
    }

    /**
     * get all available commands from its command string
     * @param {string} name
     */
    getAvailableCommands(name) {
      name = name.toLowerCase()
      return this._commands
        .filter(cmd => cmd.isEnabled())
        .filter(cmd => cmd.getCommandNames().includes(name))
    }


    /**
     * retrieves all available permissions for a certain client
     * @param {Client} client
     */
    getAvailableCommandsByPermission(client) {
      return Collector.checkPermissions(
        this._commands.filter(cmd => cmd.isEnabled()),
        client
      )
    }

    /**
     * Searches for one or multiple enabled commands with its prefix
     * @param {string} name the command with its prefix
     * @returns {BaseCommand[]} returns an array of found commands
     */
    getAvailableCommandsWithPrefix(name) {
      name = name.toLowerCase()
      return this._commands
        .filter(cmd => cmd.isEnabled())
        .filter(cmd => cmd.getFullCommandNames().includes(name))
    }

    /**
     * checks if a command is a possible command string
     * @param {string} text
     */
    isPossibleCommand(text) {
      if (text.startsWith(Collector.getCommandPrefix())) return true
      return this._commands.some(cmd => cmd.getFullCommandName() === text.split(" ")[0])
    }

    /**
     * creates a new command
     * @param {string} name the name of the command
     */
    registerCommand(name) {
      name = name.toLowerCase()
      if (!Collector.isValidCommandName(name))
        throw new Error("Can not create a command with length of 0")
      const cmd = new Command(name, this)
      this._commands.push(cmd)
      return cmd
    }

    /**
     * creates a new command
     * @param {string} name the name of the command
     */
    registerCommandGroup(name) {
      name = name.toLowerCase()
      if (!Collector.isValidCommandName(name))
        throw new Error("Can not create a command with length of 0")
      const cmd = new CommandGroup(name, this)
      this._commands.push(cmd)
      return cmd
    }

    /**
     * checks if the command string is save to register as a new command
     * this function basically checks if there is no other command named with
     * throws an error when Collector#validateCommandName errors
     * returns false when this command has been already registered
     * returns true when this is a completely unused command
     * @param {string} cmd
     */
    isSaveCommand(cmd) {
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
      /**
       * @param {string} str
       * @param {number} len
       * @private
       */
      const fixLen = (str, len) => str + Array(len - str.length).fill(" ").join("")
      let length = 0
      const cmds = (await collector.getAvailableCommandsByPermission(client))
        .filter(cmd => cmd.hasHelp())
        .filter(cmd => !filter ||
          cmd.getCommandName().match(new RegExp(filter, "i")) ||
          cmd.getHelp().match(new RegExp(filter, "i")))
      reply(`${format.bold(cmds.length.toString())} Commands found:`)
      /**
       * @type {string[][]}
       * @private
       */
      const commands = []
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
      /**
       * @type {string[][]}
       * @private
       */
      const init = [[]]
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
            }, init)
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
            }, init)
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
      /**
       * @param {BaseCommand} cmd
       * @private
       */
      const getManual = cmd => {
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
            // eslint-disable-next-line arrow-parens
            chat: (/** @type {string} */ str) => ev.reply(str),
            isSelf: () => false,
            id: () => clid,
            uid: () => clid,
            uniqueId: () => clid,
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
            getChannelGroup: () => null,
            getChannels: () => [],
            getAudioChannel: () => null,
            // eslint-disable-next-line arrow-parens
            equals: (/** @type {Client} */ client) => {
              const uid = client.uid().split("/")
              if (uid.length === 2) {
                return uid[2] === id
              } else {
                return client.uid() === clid
              }
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

  /**
   * Handles chat/message events
   * @private
   * @param {MessageEvent} ev
   */
  function messageHandler(ev) {
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
   * @name createCommandGroup
   * Creates a new CommandsCommand Instance with the given Command Name
   * @param {string} cmd - the command which should be added
   * @returns {CommandGroup} returns the created CommandGroup instance
   */
  function createCommandGroup(cmd) {
    if (!collector.isSaveCommand(cmd)) {
      debug(DEBUG.WARNING)(`WARNING there is already a command with name '${cmd}' enabled!`)
      debug(DEBUG.WARNING)(`command.js may work not as expected!`)
    }
    debug(DEBUG.VERBOSE)(`registering commandGroup '${cmd}'`)
    return collector.registerCommandGroup(cmd)
  }

  /**
   * @name createCommand
   * Creates a new Command Instance with the given Command Name
   * @param {string} cmd - the command which should be added
   * @returns {Command} returns the created Command
   */
  function createCommand(cmd) {
    if (!collector.isSaveCommand(cmd)) {
      debug(DEBUG.WARNING)(`WARNING there is already a command with name '${cmd}' enabled!`)
      debug(DEBUG.WARNING)(`command.js may work not as expected!`)
    }
    debug(DEBUG.VERBOSE)(`registering command '${cmd}'`)
    return collector.registerCommand(cmd)
  }

  /**
   * @name createArgument
   * Creates a new Argument Instance
   * @param {keyof ArgType} type - the argument type which should be created
   * @returns {Argument} returns the created Argument
   */
  function createArgument(type) {
    const arg = Argument.createArgumentLayer()[type]
    if (!(arg instanceof Argument))
      throw new Error(`Argument type not found! Available Arguments: ${Object.keys(Argument.createArgumentLayer()).join(", ")}`)
    return arg
  }

  /**
   * @name createGroupedArgument
   * creates a new Argument Instance
   * @param {"or"|"and"} type the argument type which should be created either "or" or "and" allowed
   * @returns {GroupArgument} returns the created Group Argument
   */
  function createGroupedArgument(type) {
    if (!Object.values(["or", "and"]).includes(type))
      throw new Error(`Unexpected GroupArgument type, expected one of ["or", "and"] but got ${type}!`)
    return new GroupArgument(type)
  }

  /**
   * @name getCommandPrefix
   * retrieves the current Command Prefix
   * @returns {string} returns the command prefix
   */
  function getCommandPrefix() {
    return Collector.getCommandPrefix()
  }

  /**
   * @name createThrottle
   * Creates a new Throttle Instance
   * @returns {Throttle} returns the created Throttle
   */
  function createThrottle() {
    return Collector.createThrottle()
  }

  /**
   * @name getVersion
   * retrieves the semantic version of this script
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