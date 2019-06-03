/**
 * @author Multivitamin <david.kartnaller@gmail.com>
 * @license MIT
 * @ignore
 */
registerPlugin({
  name: "Command",
  description: "Library to handle and manage commands",
  version: "1.2.3",
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

  function DEBUG(level) {
    return mode => (...args) => {
      if (mode > level) return
      engine.log(...args)
    }
  }
  DEBUG.VERBOSE = 3
  DEBUG.INFO = 2
  DEBUG.WARNING = 1
  DEBUG.ERROR = 0
  const debug = DEBUG(parseInt(DEBUGLEVEL, 10))

  const GROUP_ARGS = {
    OR: "or",
    AND: "and"
  }

  debug(DEBUG.VERBOSE)(`command prefix is "${getCommandPrefix()}"`)

  /**
   * Class representing a CommandDisabledError
   * @extends Error
   */
  class CommandDisabledError extends Error {
    constructor(err) {
      super(err)
    }
  }

  /**
   * Class representing a ThrottleError
   * @private
   * @extends Error
   */
  class ThrottleError extends Error {
    constructor(err) {
      super(err)
    }
  }

  /**
   * Class representing a TooManyArguments
   * @private
   * @extends Error
   * @param {string} err the error which will be handed over to the Error instance
   * @param {ParseError} parseError a possible ParseError
   */
  class TooManyArguments extends Error {
    constructor(err, parseError) {
      super(err)
      this.parseError = parseError
    }
  }

  /**
   * Class representing a ParseError
   * gets thrown when an Argument has not been parsed successful
   * @private
   * @extends Error
   * @param {string} err the error which will be handed over to the Error instance
   * @param {Argument} argument the argument which failed
   */
  class ParseError extends Error {
    constructor(err, argument) {
      super(err)
      this.argument = argument
    }
  }

  /**
   * Class representing a SubCommandNotFound
   * @private
   * @extends Error
   */
  class SubCommandNotFound extends Error {
    constructor(err) {
      super(err)
    }
  }

  /**
   * Class representing a PermissionError
   * @private
   * @extends Error
   */
  class PermissionError extends Error {
    constructor(err) {
      super(err)
    }
  }


  /**
   * Class representing an Argument
   * @name Argument
   */
  class Argument {
    constructor() {
      this._optional = false
      this._name = "_"
      this._display = "_"
      this._displayDefault = true
      this._default = undefined
    }

    /**
     * Sets an Argument as optional
     * if the argument has not been parsed successful it will use the first argument which has been given inside this method
     * @param {any} [fallback] the default value which should be set if this parameter has not been found
     * @param {boolean} [displayDefault=true] wether it should display the default value when called with the #getUsage method
     * @returns {Argument} returns this to chain functions
     */
    optional(fallback, displayDefault = true) {
      this._displayDefault = displayDefault
      this._default = fallback
      this._optional = true
      return this
    }

    /**
     * Retrieves the default value if it had been set
     * @returns {any} the default value of this argument
     */
    getDefault() {
      return this._default
    }

    /**
     * Checks if the Argument has a default value
     * @returns {boolean} returns true when a default value is present
     */
    hasDefault() {
      return this._default !== undefined
    }

    /**
     * Gets the manual of a command
     * @returns {string} will return a formated name
     */
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

    /**
     * Checks if the Argument is optional
     * @returns {Boolean} returns true when the current Argument is optional
     */
    isOptional() {
      return this._optional
    }

    /**
     * Sets a name for the argument to identify it later when the command gets dispatched
     * This name will be used when passing the parsed argument to the exec function
     * @param {string} name - sets the name of the argument
     * @param {string} [display] - sets a beautified display name which will be used when the getManual command gets executed, if none given it will use the first parameter as display value
     * @throws {Error}
     * @returns {Argument} returns this to make functions chainable
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


  /**
   * Class representing a GroupArgument
   * @name GroupArgument
   * @extends Argument
   * @param {string} type - the type of the Argument, should be "and" or "or"
   */
  class GroupArgument extends Argument {
    constructor(type) {
      super()
      this._type = type
      this._args = []
    }

    /**
     * Validates the given String to the GroupArgument
     * @private
     * @param {string} args - the remaining args
     * @returns {Error|Array} returns an Error if the validation failed or the resolved arg as first index and the remaining args as second index
     */
    validate(args) {
      switch (this._type) {
        case GROUP_ARGS.OR: return this._validateOr(args)
        case GROUP_ARGS.AND: return this._validateAnd(args)
        default: throw new Error(`${this._type} not a valid Group Type`)
      }
    }

    /**
     * Validates the given string to the "or" of the GroupArgument
     * @private
     * @throws {ParseError}
     * @param {string} args - the remaining args
     * @returns {Error|Array} returns an Error if the validation failed or the resolved arg as first index and the remaining args as second index
     */
    _validateOr(args) {
      const errors = []
      const resolved = {}
      const valid = this._args.some(arg => {
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
     * @private
     * @param {string} args - the remaining args
     * @returns {Error|Array} returns an Error if the validation failed or the resolved arg as first index and the remaining args as second index
     */
    _validateAnd(args) {
      const resolved = {}
      let error = null
      this._args.some(arg => {
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
     * Adds one or multiple argument to the validation chain
     * @param {...string} args - the remaining args
     * @returns {this} returns this to make it chainable
     */
    argument(...args) {
      this._args.push(...args)
      return this
    }
  }



  /**
   * Class representing a StringArgument
   * @name StringArgument
   * @extends Argument
   */
  class StringArgument extends Argument {
    constructor() {
      super()
      this._regex = null
      this._maxlen = null
      this._minlen = null
      this._whitelist = null
      this._uppercase = false
      this._lowercase = false
    }

    /**
     * Validates the given String to the StringArgument
     * @private
     * @param {string} args - the remaining args
     * @throws {ParseError} Trows an error if validation fails
     * @returns {string[]} Array containing two strings: argument and the rest
     */
    validate(args) {
      const argArray = args.split(" ")
      const str = argArray.shift()
      return this._validate(str, argArray.join(" "))
    }

    /**
     * Validates the given string to the StringArgument params
     * @private
     * @throws {ParseError}
     * @param {string} arg - string argument that should be parsed
     * @param {...string} rest - the remaining args
     * @throws {ParseError} Trows an error if validation fails
     * @returns {string[]} Array containing two strings: argument and the rest
     */
    _validate(arg, ...rest) {
      if (typeof arg !== "string") throw new ParseError(`Given input is not typeof string (typeof ${typeof arg})`, this)
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
     * @returns {StringArgument} returns this to chain Functions
     */
    match(regex) {
      this._regex = regex
      return this
    }

    /**
     * Sets the maximum Length of the String
     * @param {number} len - the maximum length of the argument
     * @returns {StringArgument} returns this to chain Functions
     */
    max(len) {
      this._maxlen = len
      return this
    }

    /**
     * Sets the minimum Length of the String
     * @param {number} len - the minimum length of the argument
     * @returns {StringArgument} returns this to chain Functions
     */
    min(len) {
      this._minlen = len
      return this
    }


    /**
     * Converts the input to an upper case string
     * @returns {StringArgument} returns this to chain Functions
     */
    forceUpperCase() {
      this._lowercase = false
      this._uppercase = true
      return this
    }


    /**
     * Converts the input to a lower case string
     * @returns {StringArgument} returns this to chain Functions
     */
    forceLowerCase() {
      this._lowercase = true
      this._uppercase = false
      return this
    }

    /**
     * Creates a list of available whitelisted words
     * @param {Array} words - array of whitelisted words
     * @returns {StringArgument} returns this to chain Functions
     */
    whitelist(words) {
      if (!Array.isArray(this._whitelist)) this._whitelist = []
      this._whitelist.push(...words)
      return this
    }
  }



  /**
   * Class representing a ClientArgument
   * this Argument is capable to parse a Client UID or a simple UID
   * inside the exec function it will resolve the found uid
   * @name ClientArgument
   * @extends Argument
   */
  class ClientArgument extends Argument {

    /**
     * Validates and tries to parse the Client from the given input string
     * @private
     * @throws {ParseError}
     * @param {string} args - the input from where the client gets extracted
     * @returns {Array} returns an Error if the validation failed or the resolved arg as first index and the remaining args as second index
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
     * @private
     * @param {string} args - the input from where the client gets extracted
     * @throws {ParseError} An error is thrown when argument is invalid
     * @returns {string[]} Array containing two strings: client UID and the rest
     */
    _validateTS3(args) {
      const match = args.match(/^(\[URL=client:\/\/\d*\/(?<url_uid>[/+a-z0-9]{27}=)~.*\].*\[\/URL\]|(?<uid>[/+a-z0-9]{27}=)) *(?<rest>.*)$/i)
      if (!match) throw new ParseError("Client not found!", this)
      return [match.groups.url_uid || match.groups.uid, match.groups.rest]
    }

    /**
     * Tries to validate a Discord Client Name or ID
     * @private
     * @param {string} args - the input from where the client gets extracted
     * @throws {ParseError} An error is thrown when argument is invalid
     * @returns {string[]} Array containing two strings: client ID and the rest
     */
    _validateDiscord(args) {
      const match = args.match(/^(<@(?<id>\d{18})>|@(?<name>.*?)#\d{4}) *(?<rest>.*)$/i)
      if (!match) throw new ParseError("Client not found!", this)
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
   * Class representing a RestArgument
   * this will parse everything remaining
   * you can use all methods from the StringArgument here
   * @name RestArgument
   * @extends StringArgument
   */
  class RestArgument extends StringArgument {

    /**
     * Validates the given String to the RestArgument
     * @private
     * @param {string} args - the remaining args
     * @throws {ParseError} Trows an error if validation fails
     * @returns {string[]} Array containing two strings: argument and the rest
     */
    validate(args) {
      return super._validate(args, "")
    }
  }

  /**
   * Class representing a NumberArgument
   * this will try to parse a number
   * @name NumberArgument
   * @extends Argument
   */
  class NumberArgument extends Argument {
    constructor() {
      super()
      this._min = null
      this._max = null
      this._integer = false
      this._forcePositive = false
      this._forceNegative = false
    }

    /**
     * Validates the given Number to the Object
     * @private
     * @throws {ParseError}
     * @param {string} args - the remaining args
     * @returns {Error|Array} returns an Error if the validation failed or the resolved arg as first index and the remaining args as second index
     */
    validate(args) {
      const argArray = args.split(" ")
      const arg = argArray.shift()
      // @ts-ignore (isNaN can also check strings)
      if (isNaN(arg)) throw new ParseError(`"${arg}" is not a number"`, this)
      const num = parseFloat(arg)
      if (isNaN(num)) throw new ParseError(`"${arg}" is not a valid number`, this)
      if (this._min !== null && this._min > num) throw new ParseError(`Number not greater or equal! Expected at least ${this._min}, but got ${num}`, this)
      if (this._max !== null && this._max < num) throw new ParseError(`Number not less or equal! Expected at least ${this._max}, but got ${num}`, this)
      if (this._integer && num % 1 !== 0) throw new ParseError(`Given Number is not an Integer! (${num})`, this)
      if (this._forcePositive && num <= 0) throw new ParseError(`Given Number is not Positive! (${num})`, this)
      if (this._forceNegative && num >= 0) throw new ParseError(`Given Number is not Negative! (${num})`, this)
      return [num, argArray.join(" ")]
    }

    /**
     * Specifies the minimum value
     * @param {number} min - the minimum length of the argument
     * @returns {NumberArgument} returns this to chain Functions
     */
    min(min) {
      this._min = min
      return this
    }

    /**
     * Specifies the maximum value
     * @param {number} max - the maximum length of the argument
     * @returns {NumberArgument} returns this to chain Functions
     */
    max(max) {
      this._max = max
      return this
    }

    /**
     * Specifies that the Number must be an integer (no floating point)
     * @returns {NumberArgument} returns this to chain Functions
     */
    integer() {
      this._integer = true
      return this
    }

    /**
     * Specifies that the Number must be a positive Number
     * @returns {NumberArgument} returns this to chain Functions
     */
    positive() {
      this._forcePositive = true
      this._forceNegative = false
      return this
    }

    /**
     * Specifies that the Number must be a negative Number
     * @returns {NumberArgument} returns this to chain Functions
     */
    negative() {
      this._forcePositive = false
      this._forceNegative = true
      return this
    }

  }


  const availableArguments = {
    string: () => new StringArgument(),
    number: () => new NumberArgument(),
    client: () => new ClientArgument(),
    rest: () => new RestArgument()
  }


  /**
   * A collection of registered commands in this library
   * @name CommandCollector
   */
  class CommandCollector {
    constructor() {
      this._commands = []
    }

    /**
     * Checks if the command uses a valid command name
     * @static
     * @param {string} name the name which should be checked
     * @param {boolean} allowSingleChar wether it should allow single char commands as name
     * @returns {boolean} returns true when the command has a valid name
     */
    static validateCommandName(name, allowSingleChar = true) {
      if (typeof name !== "string") throw new Error("Expected a string as command name!")
      if (name.length === 0) throw new Error(`Command should have a minimum length of ${allowSingleChar ? "1" : "2"}!`)
      if (name.length === 1 && !allowSingleChar) throw new Error("Command should have a minimum length of 2!")
      if (!(/^[a-z0-9_-]+$/i).test(name)) throw new Error("the command should match the following pattern '/^[a-z0-9_-]+$/i'")
      return true
    }

    /**
     * Searches for one or multiple enabled commands with its prefix
     * @param {string} cmd the command with its prefix
     * @returns {Command[]} returns an array of found commands
     */
    getAvailableCommandsWithPrefix(cmd) {
      return this._commands
        .filter(c => c.isEnabled())
        .filter(c => `${c.getPrefix()}${c.getCommandName()}` === cmd)
    }

    /**
     * Checks if a possible
     * @param {string} cmd the input string from a message
     * @returns {boolean} returns true when it is a command
     */
    isPossibleCommand(cmd) {
      if (cmd.startsWith(getCommandPrefix())) return true
      return this._commands.some(c => c.getFullCommandName() === cmd.split(" ")[0])
    }

    /**
     * Returns all possible prefixes
     * @returns {string[]} a list of prefixes across all commands
     */
    getPrefixes() {
      return this._commands.reduce((acc, cmd) => {
        if (acc.includes(cmd.getPrefix())) return acc
        return [...acc, cmd.getPrefix()]
      }, [getCommandPrefix()])
    }

    /**
     * Registers a new Command
     * @param {Command|CommandGroup} cmd the command which should be registered
     * @returns {Command|CommandGroup} returns the added Command
     */
    registerCommand(cmd) {
      this._commands.push(cmd)
      return cmd
    }

    /**
     * gets all available commands
     * @param {Client} [client] - the sinusbot client for which the commands should be retrieved if none has been omitted it will retrieve all available commands
     * @param {string} [cmd] - the command which should be searched for
     * @returns {Command[]} returns an array of commands
     */
    getAvailableCommands(client, cmd) {
      const cmds = this._commands
        .filter(c => c.getCommandName() === cmd || c.getFullCommandName() === cmd || !cmd)
        .filter(c => c.isEnabled())
      if (!client) return cmds
      return cmds.filter(c => c.isAllowed(client))
    }

    /**
     *
     * @param {string} name the name which should be searched for
     * @returns {Command|CommandGroup} returns the found Command or CommandGroup
     */
    getCommandByName(name) {
      return this._commands.find(cmd => cmd.getCommandName() === name)
    }
  }


  /**
   * Class representing a Command
   * @name Throttle
   */
  class Throttle {
    constructor() {
      this._throttled = {}
      this._penaltyPerCommand = 1
      this._initialPoints = 1
      this._restorePerTick = 1
      this._tickrate = 1000
    }

    /**
     * Defines how fast points will get restored
     * @param {number} duration - number in ms how fast points should get restored
     * @returns {Throttle} returns this in order to chain functions
     */
    tickRate(duration) {
      this._tickrate = duration
      return this
    }

    /**
     * The amount of points a command request costs
     * @param {number} amount - the amount of points that should be reduduced
     * @returns {Throttle} returns this in order to chain functions
     */
    penaltyPerCommand(amount) {
      this._penaltyPerCommand = amount
      return this
    }

    /**
     * The Amount of Points that should get restored per tick
     * @param {number} amount - the amount that should get restored
     * @returns {Throttle} returns this in order to chain functions
     */
    restorePerTick(amount) {
      this._restorePerTick = amount
      return this
    }

    /**
     * Sets the initial Points a user has at beginning
     * @param {number} initial - the Initial amount of Points a user has
     * @returns {Throttle} returns this in order to chain functions
     */
    initialPoints(initial) {
      this._initialPoints = initial
      return this
    }

    /**
     * Reduces the given points for a Command for the given Client
     * @param {object} client the client which points should be removed
     * @returns {boolean} returns true when a client is not throttled
     */
    throttle(client) {
      this._reducePoints(client.uid())
      return this.isThrottled(client)
    }

    /**
     * Restores points from the given id
     * @private
     * @param {string} id - the identifier for which the points should be stored
     */
    _restorePoints(id) {
      const throttle = this._throttled[id]
      if (throttle === undefined) return false
      throttle.points += this._restorePerTick
      if (throttle.points >= this._initialPoints)
        return Reflect.deleteProperty(this._throttled, id)
      this._refreshTimeout(id)
    }

    /**
     * Resets the timeout counter for a stored id
     * @private
     * @param {string} id - the identifier which should be added
     */
    _refreshTimeout(id) {
      if (this._throttled[id] === undefined) return
      clearTimeout(this._throttled[id].timeout)
      this._throttled[id].timeout = setTimeout(this._restorePoints.bind(this, id), this._tickrate)
      this._throttled[id].next = Date.now() + this._tickrate
    }

    /**
     * Removes points from an id
     * @private
     * @param {string} id - the identifier which should be added
     */
    _reducePoints(id) {
      const throttle = this._createIdIfNotExists(id)
      throttle.points -= this._penaltyPerCommand
      this._refreshTimeout(id)
    }

    /**
     * @private
     * @typedef {Object} ThrottleEntry
     * @property {number} points
     */

    /**
     * Creates the identifier in the _throttled object
     * @private
     * @param {string} id - the identifier which should be added
     * @returns {ThrottleEntry} returns an object with a points property
     */
    _createIdIfNotExists(id) {
      if (Object.keys(this._throttled).includes(id)) return this._throttled[id]
      this._throttled[id] = { points: this._initialPoints }
      return this._throttled[id]
    }

    /**
     * Checks if the given Client is affected by throttle limitations
     * @param {object} client - the sinusbot client that should get checked
     * @returns {boolean} returns true when a client is not throttled
     */
    isThrottled(client) {
      const throttle = this._throttled[client.uid()]
      if (throttle === undefined) return false
      return throttle.points <= 0
    }

    /**
     * retrieves the time in milliseconds until a client can send his next command
     * @param {object} client the client which should be checked
     * @returns {number} returns the time in ms
     */
    timeTillNextCommand(client) {
      if (this._throttled[client.uid()] === undefined) return 0
      return this._throttled[client.uid()].next - Date.now()
    }
  }

  /**
   * Class representing a Command
   * @name Command
   * @param {string} cmd - The Command which should be used
   */
  class Command {
    constructor(cmd) {
      this._cmd = cmd
      this._enabled = true
      this._help = ""
      this._prefix = ""

      /** @type {Throttle} */
      this._throttle = null
      this._args = []
      this._manual = []
      this._fncs = {}
    }

    /**
     * Searches and returns the given function name
     * @private
     * @param {string} name - the function name which should be searched for
     * @param {function} [fallback] - returns a fallback function if no function under the name has been found
     * @returns {function} - the stored function
     */
    _getFunction(name, fallback = () => true) {
      if (typeof this._fncs[name] === "function") return this._fncs[name]
      return fallback
    }

    /**
     * Stores a function with the given name, can be used to overwrite a function
     * @private
     * @param {string} name - the name for which the function should be stored
     * @param {function} [fnc] - the function which should be stored
     * @returns {Command} returns this to chain Functions
     */
    _storeFunction(name, fnc = () => true) {
      if (typeof fnc !== "function") throw new Error("Parameter is no a function!")
      this._fncs[name] = fnc
      return this
    }

    /**
     * Checks if a function with the specified name has been stored
     * @private
     * @param {string} name the function which should be searched for
     * @returns {boolean} returns true when a function has been found
     */
    _hasFunction(name) {
      return typeof this._fncs[name] === "function"
    }

    /**
     * Checks if the client is throttled and reduces points
     * @private
     * @throws {ThrottleError}
     * @param {object} client the client for which throttling should be handled
     */
    _handleThrottle(client) {
      const throttle = this._throttle
      if (!(throttle instanceof Throttle)) return
      if (throttle.isThrottled(client)) {
        const time = (throttle.timeTillNextCommand(client) / 1000).toFixed(1)
        throw new ThrottleError(`You can use this command again in ${time} seconds!`)
      } else {
        throttle.throttle(client)
      }
    }

    /**
     * Retrieves the current command name
     * @returns {string} returns the command by its name
     */
    getCommandName() {
      return this._cmd
    }

    /**
     * Retrieves the current command name with its prefix
     * @returns {string} returns the command and its prefix
     */
    getFullCommandName() {
      return `${this.getPrefix()}${this._cmd}`
    }

    /**
     * Forces a different Prefix then given by the Instance Settings
     * THIS SHOULD ONLY BE USED WHEN HAVING A GOOD REASON TO DO SO
     * @param {string} prefix sets the new prefix for this command
     * @returns {Command} returns this to chain Functions
     */
    forcePrefix(prefix) {
      if (typeof prefix !== "string") throw new Error(`Prefix should be a string! "${typeof prefix}" given!`)
      if ((/\s/).test(prefix)) throw new Error("Prefix can not contain whitespaces")
      this._prefix = prefix
      return this
    }

    /**
     * Retrieves the current prefix for which the command listens to
     * @returns {string} returns the command prefix
     */
    getPrefix() {
      if (this._prefix === "") return getCommandPrefix()
      return this._prefix
    }

    /**
     * Sets a short help text for the help command (used inside the !help command)
     * This should be a very brief description of what the command does
     * @param {string} text - the short help text
     * @returns {Command} returns this to chain Functions
     */
    help(text = "") {
      this._help = text
      return this
    }

    /**
     * Checks if the Command has a help text
     * @returns {boolean} returns true if the command has a help text
     */
    hasHelp() {
      return typeof this._help === "string" && this._help.length > 0
    }

    /**
     * Retrieves the SHort Help Command
     * @returns {string} returns the short help text
     */
    getHelp() {
      return this._help
    }

    /**
     * Adds an Instance of the Throttle class
     * @param {Throttle} throttle adds the throttle instance
     * @returns {Command} returns this to chain Functions
     */
    throttle(throttle) {
      if (!(throttle instanceof Throttle))
        throw new Error("throttle requires as first argument an instance of throttle")
      this._throttle = throttle
      return this
    }

    /**
     * Disables the command
     * it can be enabled again with the method #enable()
     * @returns {Command} returns this to chain Functions
     */
    disable() {
      debug(DEBUG.VERBOSE)(`Command "${this.getCommandName()}" has been disabled`)
      this._enabled = false
      return this
    }

    /**
     * Enables the command
     * @returns {Command} returns this to chain Functions
     */
    enable() {
      debug(DEBUG.VERBOSE)(`Command "${this.getCommandName()}" has been enabled`)
      this._enabled = true
      return this
    }

    /**
     * checks if the command is currently enabled
     * @returns {Boolean} returns true when the command is enabled
     */
    isEnabled() {
      return this._enabled
    }

    /**
     * @interface
     * @typedef {object} MessageEvent
     * @implements {Message}
     * @property {string} text - Text of the message
     * @property {Channel} channel - Channel (if given) this message has been sent on
     * @property {Client} client - Client that sent the message
     * @property {number} mode - Number representing the way this message has been sent
     * (1 = private, 2 = channel, 3 = server)
     * @property {DiscordMessage} [message] - When backend is `discord` this will be the callback parameter of the message event, otherwise undefined
     */

    /**
     * @callback execFunction
     * @see exec
     * @since 1.2.3
     * @param {MessageEvent} ev
     */

    /**
     * Sets the function which gets executed
     * @param {execFunction} fnc the function which should be executed when the command has been validated successful
     * @returns {Command} returns this to chain Functions
     */
    exec(fnc) {
      this._storeFunction("exec", fnc)
      return this
    }

    /**
     * Dispatches a command
     * @param {object} args the parsed arguments
     * @param {object} ev the raw event
     */
    dispatchCommand(args, ev) {
      return this._getFunction("exec")(ev.client, args, getReplyOutput(ev), ev)
    }

    /**
     * Sets a detailed manual command on how to use the command
     * the manual command can be called multiple times, for every call it will add it as a new line
     * use this to create a detailed documentation for your command
     * @param {string} text the manual text
     * @returns {Command} returns this to chain Functions
     */
    manual(text = "") {
      this._manual.push(text)
      return this
    }

    /**
     * Checks if the Command has a manual text
     * @returns {boolean} returns true if the command has a manual text
     */
    hasManual() {
      return this._manual.length > 0
    }

    /**
     * Retrieves the Manual text
     * @returns {string} returns the manual Command
     */
    getManual() {
      return this._manual.join("\r\n")
    }

    /**
     * Retrieves the usage of the command with its parameterized names
     * @returns {string} retrieves the complete usage of the command with its argument names
     */
    getUsage() {
      return `${this.getFullCommandName()} ${this.getArguments().map(arg => arg.getManual()).join(" ")}`
    }

    /**
     * Checks if the client has permissions to execute this command
     * takes a function as argument which will be called on every permission test
     * the function will receive the sinusbot client object as first parameter
     * the client should return a true value when the client is allowed to execute the command
     * @param {function} fnc - the function which gets executed
     * @returns {Command} returns this to chain Functions
     */
    checkPermission(fnc) {
      this._storeFunction("perms", fnc)
      return this
    }

    /**
     * Checks if a Client is allowed to use the command
     * @param {object} client - the sinusbot client object to check against
     * @returns {boolean} returns true if the client is allowed to use the command
     */
    isAllowed(client) {
      try {
        return Boolean(this._getFunction("perms")(client))
      } catch (e) {
        debug(DEBUG.ERROR)(e.stack)
        return false
      }
    }

    /**
     * Runs a command
     * @throws {CommandDisabledError}
     * @throws {PermissionError}
     * @param {string} args the raw argument string
     * @param {object} ev the raw event
     */
    run(args, ev) {
      if (!this.isEnabled()) throw new CommandDisabledError("Command not enabled!")
      if (!this.isAllowed(ev.client)) throw new PermissionError("Missing Permissions")
      this._handleThrottle(ev.client)
      this.dispatchCommand(this.validate(args), ev)
    }

    /**
     * Validates the command
     * @throws {TooManyArguments}
     * @param {string} args the arguments from the command which should be validated
     * @returns {object} returns the resolved arguments
     */
    validate(args) {
      const [result, possibleErrors, remaining] = this.validateArgs(args)
      if (remaining.length > 0) throw new TooManyArguments(`Too many argument!`, possibleErrors.length > 0 ? possibleErrors[0] : null)
      return result
    }

    /**
     * Validates the given input string to all added arguments
     * @param {string} args the string which should get validated
     * @returns {array} returns the parsed arguments in index 1, possible Errors on index 2 and the remaining arguments on index
     */
    validateArgs(args) {
      args = args.trim()
      const resolved = {}
      const possibleErrors = []
      this.getArguments().forEach(arg => {
        try {
          const [val, rest] = arg.validate(args)
          resolved[arg.getName()] = val
          args = rest.trim()
        } catch (e) {
          if (e instanceof ParseError && arg.isOptional()) {
            resolved[arg.getName()] = arg.getDefault()
            return possibleErrors.push(e)
          }
          throw e
        }
      })
      return [resolved, possibleErrors, args]
    }

    /**
     * Adds an argument to the command
     * @param {Argument} argument - the argument to add
     * @returns {Command} returns this to chain the command
     */
    addArgument(argument) {
      this._args.push(argument)
      return this
    }

    /**
     * Retrieves all available arguments
     * @returns {array} returns a list of defined Arguments
     */
    getArguments() {
      return this._args
    }
  }

  /**
   * Class representing a CommandGroup
   * @name CommandGroup
   * @extends Command
   * @param {string} cmd - The Command which should be used
   */
  class CommandGroup extends Command {
    constructor(cmd) {
      super(cmd)
      this._cmds = []
    }

    /**
     * Overwrite the method of Parent class
     * @throws {Error} command not available
     */
    // @ts-ignore (different signature doesn't matter since it throws an error anyway)
    addArgument() {
      throw new Error("This method is not available in the CommandGroup class!")
    }

    /**
     * Adds a new sub Commmand to the group
     * @param {string} name the sub command name which should be added
     * @returns {SubCommand} returns the new command
     */
    addCommand(name) {
      CommandCollector.validateCommandName(name)
      const cmd = new SubCommand(name)
      this._cmds.push(cmd)
      return cmd
    }

    /**
     * Retrieves a subcommand by its command name
     * @throws {CommandNotFound}
     * @param {string} name the name which should be searched for
     * @returns {SubCommand} returns the Command instance if found
     */
    findSubCommandByName(name) {
      if (name.length === 0) throw new SubCommandNotFound(`No subcommand specified for Command ${this.getFullCommandName()}`)
      const cmd = this._cmds.find(c => c.getCommandName() === name)
      if (!cmd) throw new SubCommandNotFound(`Sub command with name "${name}" has not been found for Command ${this.getFullCommandName()}!`)
      return cmd
    }

    /**
     * retrievel all available subcommands
     * @param {Client} [client] - the sinusbot client for which the commands should be retrieved if none has been omitted it will retrieve all available commands
     * @param {string} [cmd] - the command which should be searched for
     * @return
     */
    getAvailableSubCommands(client, cmd) {
      const cmds = this._cmds
        .filter(c => c.getCommandName() === cmd || !cmd)
        .filter(c => c.isEnabled())
      if (!client) return cmds
      return cmds.filter(c => c.isAllowed(client))
    }

    /**
     * Checks if a Client is allowed to use the GroupArgument and at least one of the sub commands
     * When the GroupArgument Permission check returns false then every the client is not allowed to access any sub command
     * @param {object} client - the sinusbot client object to check against
     * @returns {boolean} returns true if the client is allowed to use one of the subcommands
     */
    isAllowed(client) {
      if (!super.isAllowed(client)) return false
      if (super._hasFunction("exec")) return true
      return this._cmds.some(cmd => cmd.isAllowed(client))
    }

    /**
     * Runs a command
     * @throws {CommandDisabledError}
     * @throws {PermissionError}
     * @param {string} args the raw argument string
     * @param {object} ev the raw event
     */
    run(args, ev) {
      if (!super.isEnabled()) throw new CommandDisabledError("Command not enabled!")
      if (!this.isAllowed(ev.client)) throw new PermissionError("Missing Permissions")
      const [sub, ...rest] = args.split(" ")
      if (sub.length === 0 && super._hasFunction("exec")) return super.dispatchCommand({}, ev)
      return this.findSubCommandByName(sub).run(rest.join(" "), ev)
    }
  }


  /**
   * Class representing a SubCommand which will be used within CommandGroups
   * @name SubCommand
   * @extends Command
   * @param {string} cmd - The Command Name which should be used
   */
  class SubCommand extends Command {
    constructor(cmd) {
      super(cmd)
    }

    /**
     * Overwrite the method of Parent class
     * @throws {Error} command not available
     */
    // @ts-ignore (different signature doesn't matter since it throws an error anyway)
    getPrefix() {
      throw new Error("This method is not available in the SubCommand class!")
    }

    /**
     * Overwrite the method of Parent class
     * @throws {Error} command not available
     */
    setPrefix() {
      throw new Error("This method is not available in the SubCommand class!")
    }

    /**
     * Retrieves the usage of the command with its parameterized names
     * @returns {string} retrieves the complete usage of the command with its argument names
     */
    getUsage() {
      return `${super.getCommandName()} ${super.getArguments().map(arg => arg.getManual()).join(" ")}`
    }

  }

  /**
   * @type {CommandCollector}
   * @const
   */
  const collector = new CommandCollector()


  /**
   * Creates a new Command Instance with the given Command Name
   * @name createCommand
   * @param {string} cmd - the command which should be added
   * @param {string} [OVERRIDES] - enter `"YES_I_KNOW_THAT_I_SHOULD_NOT_USE_COMMANDS_WITH_LENGTH_OF_ONE"` to allow commands with the length of one
   * @returns {Command} returns the created Command
   */
  function createCommand(cmd, OVERRIDES) {
    CommandCollector.validateCommandName(cmd, OVERRIDES === "YES_I_KNOW_THAT_I_SHOULD_NOT_USE_COMMANDS_WITH_LENGTH_OF_ONE")
    debug(DEBUG.VERBOSE)(`registering command '${cmd}'`)
    if (collector.getCommandByName(cmd)) {
      debug(DEBUG.WARNING)(`WARNING there is already a command with name '${cmd}' enabled!`)
      debug(DEBUG.WARNING)(`command.js may work not as expected!`)
    }
    // @ts-ignore (returns Command since Command is given)
    return collector.registerCommand(new Command(cmd))
  }

  /**
   * Creates a new CommandsCommand Instance with the given Command Name
   * @name createCommandGroup
   * @param {string} cmd - the command which should be added
   * @param {string} [OVERRIDES] - enter `"YES_I_KNOW_THAT_I_SHOULD_NOT_USE_COMMANDS_WITH_LENGTH_OF_ONE"` to allow commands with the length of one
   * @returns {CommandGroup} returns the created CommandGroup instance
   */
  function createCommandGroup(cmd, OVERRIDES) {
    CommandCollector.validateCommandName(cmd, OVERRIDES === "YES_I_KNOW_THAT_I_SHOULD_NOT_USE_COMMANDS_WITH_LENGTH_OF_ONE")
    debug(DEBUG.VERBOSE)(`registering commandGroup '${cmd}'`)
    if (collector.getCommandByName(cmd)) {
      debug(DEBUG.WARNING)(`WARNING there is already a command with name '${cmd}' enabled!`)
      debug(DEBUG.WARNING)(`command.js may work not as expected!`)
    }
    // @ts-ignore (returns CommandGroup since CommandGroup is given)
    return collector.registerCommand(new CommandGroup(cmd))
  }

  /**
   * Creates a new Argument Instance
   * @name createArgument
   * @param {string} type - the argument type which should be created
   * @returns {Argument} returns the created Argument
   */
  function createArgument(type) {
    if (typeof availableArguments[type.toLowerCase()] !== "function")
      throw new Error(`Argument type not found! Available Arguments: ${Object.keys(availableArguments).join(", ")}`)
    return availableArguments[type.toLowerCase()]()
  }

  /**
   * Creates a new Argument Instance
   * @name createGroupedArgument
   * @param {string} type - the argument type which should be created either "or" or "and" allowed
   * @returns {GroupArgument} returns the created Group Argument
   */
  function createGroupedArgument(type) {
    if (!Object.values(GROUP_ARGS).includes(type)) throw new Error(`Unexpected GroupArgument type, expected one of [${Object.values(GROUP_ARGS).join(", ")}] but got ${type}!`)
    return new GroupArgument(type)
  }

  /**
   * Creates a new Throttle Instance
   * @name createThrottle
   * @returns {Throttle} returns the created Throttle
   */
  function createThrottle() {
    return new Throttle()
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

  /**
   * Returns the correct reply chat from where the client has sent the message
   * @private
   * @name getReplyOutput
   * @param {object} ev the sinusbot chat event
   * @param {number} ev.mode the mode from where the message came from [1=client, 2=channel, 3=server]
   * @param {Client} ev.client the sinusbot client which sent the message
   * @param {Channel} ev.channel the channel from where the command has been received
   * @returns {function} returns a function where the chat message gets redirected to
   */
  function getReplyOutput({ mode, client, channel }) {
    switch (mode) {
      case 1: return client.chat.bind(client)
      case 2: return channel.chat.bind(channel)
      case 3: return backend.chat.bind(backend)
      default: return msg => debug(DEBUG.WARNING)(`WARN no reply channel set for mode ${mode}, message "${msg}" not sent!`)
    }
  }

  //creates the help command
  createCommand("help")
    .help("Displays this text")
    .manual(`Displays a list of useable commands`)
    .manual(`you can search/filter for a specific commands by adding a keyword`)
    // @ts-ignore (StringArgument has min)
    .addArgument(createArgument("string").setName("filter").min(1).optional())
    .exec((client, { filter }, reply) => {
      const fixLen = (str, len) => str + Array(len - str.length).fill(" ").join("")
      let length = 0
      const cmds = collector.getAvailableCommands(client)
        .filter(cmd => cmd.hasHelp())
        .filter(cmd => !filter ||
          cmd.getCommandName().match(new RegExp(filter, "i")) ||
          cmd.getHelp().match(new RegExp(filter, "i")))
      reply(`${format.bold(cmds.length.toString())} Commands found:`)
      const commands = []
      cmds
        .forEach(cmd => {
          if (cmd instanceof CommandGroup) {
            if (cmd.getFullCommandName().length > length) length = cmd.getFullCommandName().length
            cmd.getAvailableSubCommands(client).forEach(sub => {
              if (cmd.getFullCommandName().length + sub.getCommandName().length + 1 > length)
                length = cmd.getFullCommandName().length + sub.getCommandName().length + 1
              commands.push([`${cmd.getFullCommandName()} ${sub.getCommandName()}`, sub.getHelp()])
            })
          } else {
            if (cmd.getFullCommandName().length > length) length = cmd.getFullCommandName().length
            commands.push([cmd.getFullCommandName(), cmd.getHelp()])
          }
        })
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
            }, [[]])
            .forEach(lines => reply(format.code(lines.join("\n"))))
        default:
        case "ts3":
          return commands.forEach(([cmd, help]) => reply(`${format.bold(cmd)} - ${help}`))
      }
    })

  //creates the man command
  createCommand("man")
    .help("Displays detailed help about a command if available")
    .manual(`Displays detailed usage help for a specific command`)
    .manual(`Arguments with Arrow Brackets (eg. < > ) are mandatory arguments`)
    .manual(`Arguments with Square Brackets (eg. [ ] ) are optional arguments`)
    // @ts-ignore (StringArgument has min)
    .addArgument(createArgument("string").setName("command").min(1))
    // @ts-ignore (StringArgument has min)
    .addArgument(createArgument("string").setName("subcommand").min(1).optional(false, false))
    .exec((client, { command, subcommand }, reply) => {
      const getManual = cmd => {
        if (cmd.hasManual()) return cmd.getManual()
        if (cmd.hasHelp()) return cmd.getHelp()
        return "No manual available"
      }
      const cmds = collector.getAvailableCommands(client, command)
      if (cmds.length === 0) return reply(`No command with name ${format.bold(command)} found! Did you misstype the command?`)
      cmds.forEach(cmd => {
        if (cmd instanceof CommandGroup) {
          if (subcommand) {
            cmd.getAvailableSubCommands(client, subcommand).forEach(sub => {
              reply(`\n${format.bold("Usage:")} ${cmd.getFullCommandName()} ${sub.getUsage()}\n${getManual(sub)}`)
            })
          } else {
            reply(`${format.bold(cmd.getFullCommandName())} - ${getManual(cmd)}`)
            cmd.getAvailableSubCommands(client).forEach(sub => {
              reply(`${format.bold(`${cmd.getFullCommandName()} ${sub.getUsage()}`)} - ${sub.getHelp()}`)
            })
          }
        } else {
          reply(`\nManual for command: ${format.bold(cmd.getFullCommandName())}\n${format.bold("Usage:")} ${cmd.getUsage()}\n${getManual(cmd)}`)
        }
      })
    })

  if (engine.getBackend() === "discord") {
    event.on("message", ev => {
      // create compatible Message object
      messageHandler({
        text: ev.content(),
        channel: ev.channel(),
        client: ev.author(),
        mode: ev.guildID() ? 2 : 1,
        // @ts-ignore
        message: ev
      })
    })
  } else {
    event.on("chat", messageHandler)
  }

  /**
   * Handles chat/message events
   * @private
   * @param {Message} ev
   */
  function messageHandler(ev) {
    //do not do anything when the bot sends a message
    if (ev.client.isSelf()) return debug(DEBUG.VERBOSE)("Will not handle messages from myself")
    //check if it is a possible command
    if (!collector.isPossibleCommand(ev.text)) return debug(DEBUG.VERBOSE)("No possible valid command found!")
    //get the basic command with arguments and command splitted
    const { command, args } = ev.text.match(new RegExp(`^(?<command>\\S*)\\s*(?<args>.*)\\s*$`, "s")).groups
    //check if command exists
    const commands = collector.getAvailableCommandsWithPrefix(command)
    if (commands.length === 0) {
      //depending on the config setting return without error
      if (NOT_FOUND_MESSAGE !== "0") return
      //send the not found message
      return getReplyOutput(ev)(`There is no enabled command named ${format.bold(command)}, check ${format.bold(`${getCommandPrefix()}help`)} to get a list of available commands!`)
    }
    //handle every available command, should actually be only one command
    commands.forEach(async cmd => {
      const start = Date.now()
      try {
        //run the cmd, this will
        // - check for permissions
        // - parse the arguments
        // - dispatch the command
        await cmd.run(args, ev)
        debug(DEBUG.VERBOSE)(`Command "${cmd.getFullCommandName()}" finnished successfully after ${Date.now() - start}ms`)
      //catch errors, parsing errors / permission errors or anything else
      } catch (e) {
        debug(DEBUG.VERBOSE)(`Command "${cmd.getFullCommandName()}" failed after ${Date.now() - start}ms`)
        const reply = getReplyOutput(ev)
        //Handle Command not found Exceptions for CommandGroups
        let response = (engine.getBackend() === "ts3" ? "\n" : "")
        if (e instanceof SubCommandNotFound) {
          response += `${e.message}\n`
          response += `For Command usage see ${format.bold(`${getCommandPrefix()}man ${cmd.getCommandName()}`)}\n`
          reply(response)
        } else if (e instanceof PermissionError) {
          response += `You do not have permissions to use this command!\n`
          response += `To get a list of available commands see ${format.bold(`${getCommandPrefix()}help`)}`
          reply(response)
        } else if (e instanceof ParseError) {
          response += `Invalid Command usage! For Command usage see ${format.bold(`${getCommandPrefix()}man ${cmd.getCommandName()}`)}\n`
          reply(response)
        } else if (e instanceof ThrottleError) {
          reply(e.message)
        } else if (e instanceof TooManyArguments) {
          response += `Too many Arguments received for this Command!\n`
          if (e.parseError) {
            response += `Argument parsed with an error ${format.bold(e.parseError.argument.getManual())}\n`
            response += `Returned with ${format.bold(e.parseError.message)}\n`
          }
          response += `Invalid Command usage! For Command usage see ${format.bold(`${getCommandPrefix()}man ${cmd.getCommandName()}`)}`
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