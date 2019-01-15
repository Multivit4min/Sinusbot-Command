/**
 * @author Multivitamin <david.kartnaller@gmail.com>
 * @license MIT
 * @ignore
 */
registerPlugin({
  name: "Command",
  description: "Library to handle and manage Commands",
  version: "1.0.1",
  author: "Multivitamin <david.kartnaller@gmail.com>",
  autorun: true,
  backends: ["ts3", "discord"],
  vars: [{
    name: "NOT_FOUND_MESSAGE",
    title: "Send a message if no command has been found?",
    type: "select",
    options: ["YES", "NO"],
    default: "0"
  }, {
    name: "DEBUGLEVEL",
    title: "Debug Messages (default is INFO)",
    type: "select",
    options: ["ERROR", "WARNING", "INFO", "VERBOSE"],
    default: "2"
  }]
}, (_, config) => {

  const engine = require("engine")
  const event = require("event")
  const backend = require("backend")
  const format = require("format")
  var commands = []

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
  const debug = DEBUG(parseInt(config.DEBUGLEVEL, 10))

  const GROUP_ARGS = {
    OR: "or",
    AND: "and"
  }

  debug(DEBUG.INFO)(`command prefix is "${getCommandPrefix()}"`)

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
   * Class representing a TooManyArguments
   * @extends Error
   */
  class TooManyArguments extends Error {
    constructor(err) {
      super(err)
    }
  }

  /**
   * Class representing a ParseError
   * @extends Error
   */
  class ParseError extends Error {
    constructor(err) {
      super(err)
    }
  }

  /**
   * Class representing a SubCommandNotFound
   * @extends Error
   */
  class SubCommandNotFound extends Error {
    constructor(err) {
      super(err)
    }
  }

  /**
   * Class representing a CommandNotFound
   * @extends Error
   */
  class CommandNotFound extends Error {
    constructor(err) {
      super(err)
    }
  }

  /**
   * Class representing a PermissionError
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
      this._default = undefined
    }

    /**
     * Sets an Argument as optional
     * if the argument has not been parsed successful it will use the first argument which has been given inside this method
     * @param {any} [fallback] - the default value which should be set if this parameter has not been found
     * @returns {Argument} returns this to chain functions
     */
    optional(fallback) {
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
        return `[${this._display}${this.hasDefault() ? `=${this.getDefault()}`: ""}]`
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
     * Sets a name for the argument to identify it later when the Command gets dispatched
     * This name will be used when passing the parsed argument to the exec function
     * @param {string} name - sets the name of the argument
     * @param {string} [display] - sets a beautified display name which will be used when the getManual command gets executed, if none given it will use the first parameter as display value
     * @returns {Argument} returns this to make functions chainable
     */
    setName(name, display = false) {
      this._display = display
      if (this._display === false) this._display = name
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
      var errors = []
      var resolved = {}
      var valid = this._args.some(arg => {
        var result = arg.validate(args)
        if (result instanceof Error)
          return (errors.push(result), false)
        resolved[arg.getName()] = result[0]
        return (args = result[1].trim(), true)
      })
      if (!valid) throw new ParseError(`No valid match found`)
      return [resolved, args]
    }

    /**
     * Validates the given string to the "and" of the GroupArgument
     * @private
     * @param {string} args - the remaining args
     * @returns {Error|Array} returns an Error if the validation failed or the resolved arg as first index and the remaining args as second index
     */
    _validateAnd(args) {
      var resolved = {}
      var error = null
      this._args.some(arg => {
        var result = arg.validate(args)
        if (result instanceof Error) return (error = result, true)
        resolved[arg.getName()] = result[0]
        return (args = result[1].trim(), false)
      })
      if (error !== null) return error
      return [resolved, args]
    }

    /**
     * Adds one or multiple argument to the validation chain
     * @param {string} args - the remaining args
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
    constructor(ignoreWhitespace = false) {
      super()
      super._parent = this
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
     * @returns {Error|Array} returns an Error if the validation failed or the resolved arg as first index and the remaining args as second index
     */
    validate(args) {
      var argArray = args.split(" ")
      var str = argArray.shift()
      return this._validate(str, argArray.join(" "))
    }

    /**
     * Validates the given string to the StringArgument params
     * @private
     * @throws {ParseError}
     * @param {string} args - args which should get parsed
     * @param {string} rest - the remaining args
     * @returns {Error|boolean} returns true when validation was successful otherwise returns an Error
     */
    _validate(str, ...rest) {
      if (typeof str !== "string") throw new ParseError(`Given input is not typeof string (typeof ${typeof str})`)
      if (this._uppercase) str = str.toUpperCase()
      if (this._lowercase) str = str.toLowerCase()
      if (this._minlen !== null && this._minlen > str.length) throw new ParseError(`String length not greater or equal! Expected at least ${this._minlen}, but got ${str.length}`)
      if (this._maxlen !== null && this._maxlen < str.length) throw new ParseError(`String length not less or equal! Maximum ${this._maxlen} chars allowed, but got ${str.length}`)
      if (this._whitelist !== null && this._whitelist.indexOf(str) === -1) throw new ParseError(`Invalid Input for ${str}. Allowed words: ${this._whitelist.join(", ")}`)
      if (this._regex !== null && !this._regex.test(str)) throw new ParseError(`Regex missmatch, the input '${str}' did not match the expression ${this._regex.toString()}`)
      return [str, ...rest]
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
    constructor() {
      super()
      super._parent = this
    }

    /**
     * Validates and tries to parse the Client from the given input string
     * @private
     * @throws {ParseError}
     * @param {string} args - the input from where the client gets extracted
     * @returns {Error|Array} returns an Error if the validation failed or the resolved arg as first index and the remaining args as second index
     */
    validate(args) {
      var match = args.match(/^(\[URL=client:\/\/\d*\/(?<url_uid>[\/+a-z0-9]{27}=)~.*\].*\[\/URL\]|(?<uid>[\/+a-z0-9]{27}=)) *(?<rest>.*)$/i)
      if (!match) throw new ParseError("Client not found!")
      return [match.groups.url_uid||match.groups.uid, match.groups.rest]
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
    constructor() {
      super()
    }

    /**
     * Validates the given String to the RestArgument
     * @private
     * @param {string} args - the remaining args       
     * @returns {Error|Array} returns an Error if the validation failed or the resolved arg as first index and the remaining args as second index
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
      super._parent = this
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
      var argArray = args.split(" ")
      var num = argArray.shift()
      if (isNaN(num)) throw new ParseError(`Searched for number but found "${num}"`)
      num = parseFloat(num)
      if (isNaN(num)) throw new ParseError(`Given input is not typeof Number (typeof ${typeof num})`)
      if (this._min !== null && this._min > num) throw new ParseError(`Number not greater or equal! Expected at least ${this._min}, but got ${num}`)
      if (this._max !== null && this._max < num) throw new ParseError(`Number not less or equal! Expected at least ${this._max}, but got ${num}`)
      if (this._integer && num % 1 !== 0) throw new ParseError(`Given Number is not an Integer! (${num})`)
      if (this._forcePositive && num <= 0) throw new ParseError(`Given Number is not Positive! (${num})`)
      if (this._forceNegative && num >= 0) throw new ParseError(`Given Number is not Negative! (${num})`)
      return [num, argArray.join(" ")]
    }

    /**
     * Specifies the minimum value
     * @param {number} len - the maximum length of the argument
     * @returns {NumberArgument} returns this to chain Functions
     */
    min(min) {
      this._min = min
      return this
    }

    /**
     * Specifies the maximum value
     * @param {number} len - the maximum length of the argument
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
   * Class representing an Abstract
   * @name Abstract
   * @param {string} cmd - The Command which should be used
   */
  class Abstract {
    constructor(cmd) {
      this._cmd = cmd
      this._enabled = true
      this._help = ""
    }

    /**
     * Retrieves the current command name
     * @returns {string} returns the command by its name
     */
    getCommand() {
      return this._cmd
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
     * Disables the command
     * it can be enabled again with the method #enable()
     * @returns {Command} returns this to chain Functions
     */
    disable() {
      debug(DEBUG.VERBOSE)(`Command "${this.getCommand()}" has been disabled`)
      this._enabled = false
      return this
    }

    /**
     * Enables the command
     * @returns {Command} returns this to chain Functions
     */
    enable() {
      debug(DEBUG.VERBOSE)(`Command "${this.getCommand()}" has been enabled`)
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

  }

  /**
   * Class representing a CommandGroup
   * @name CommandGroup
   * @extends Abstract
   * @param {string} cmd - The Command which should be used
   */
  class CommandGroup extends Abstract {
    constructor(cmd) {
      super(cmd)
      this._cmd
      this._cmds = []
    }

    /**
     * Adds a new sub Commmand to the group
     * @param {string} name the sub command name which should be added
     * @returns {Command} returns the new command
     */
    addCommand(name) {
      validateCommandName(name)
      var cmd = new Command(name)
      this._cmds.push(cmd)
      return cmd
    }

    /**
     * Retrieves a subcommand by its command name
     * @throws {CommandNotFound}
     * @param {string} name the name which should be searched for
     * @returns {Command} returns the Command instance if found
     */
    findSubCommandByName(name) {
      if (name.length === 0) throw new SubCommandNotFound(`No subcommand specified for Command ${this.getCommand()}`)
      var cmd = this._cmds.find(cmd => cmd.getCommand() === name)
      if (!cmd) throw new SubCommandNotFound(`Sub command with name "${name}" has not been found for Command ${this.getCommand()}!`)
      return cmd
    }
    
    /**
     * retrievel all available subcommands
     * @param {Client} [client] - the sinusbot client for which the commands should be retrieved if none has been omitted it will retrieve all available commands
     * @param {string|boolean} [cmd=false] - the command which should be searched for
     * @return
     */
    getAvailableSubCommands(client = false, cmd = false) {
      console.log("available sub", cmd, typeof cmd)
      var cmds = this._cmds
        .filter(c => c.getCommand() === cmd || cmd === false)
        .filter(c => c.isEnabled())
      if (!client) return cmds
      return cmds.filter(c => c.isAllowed(client))
    }

    /**
     * Checks if a Client is allowed to use one of the sub commands
     * @param {object} client - the sinusbot client object to check against
     * @returns {boolean} returns true if the client is allowed to use one of the subcommands
     */
    isAllowed(client) {
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
      var [sub, ...rest] = args.split(" ")
      return this.findSubCommandByName(sub).run(rest.join(" "), ev)
    }
  }


  /** 
   * Class representing a Command
   * @name Command
   * @extends Abstract
   * @param {string} cmd - The Command which should be used
   */
  class Command extends Abstract {
    constructor(cmd) {
      super(cmd)
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
     * Sets a detailed manual command on how to use the command
     * the manual command can be called multiple times, for every call it will add it as a new line
     * use this to create a detailed documentation for your command
     * @param {string} text - the manual text
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
      return `${this.getCommand()} ${this.getArguments().map(arg => arg.getManual()).join(" ")}`
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
      return Boolean(this._getFunction("perms")(client))
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
      this.dispatchCommand(this.validate(args), ev)
    }

    /**
     * Validates the command
     * @throws {TooManyArguments}
     * @param {string} args the arguments from the command which should be validated
     * @returns {object} returns the resolved arguments
     */
    validate(args) {
      var [result, possibleErrors, remaining] = this.validateArgs(args)
      if (remaining.length > 0) {
        if (possibleErrors.length > 0) throw possibleErrors[0]
        throw new TooManyArguments(`Too many argument!`)
      }
      return result
    }

    /**
     * Validates the given input string to all added arguments
     * @param {string} args the string which should get validated
     * @returns {array} returns the parsed arguments in index 1, possible Errors on index 2 and the remaining arguments on index
     */
    validateArgs(args) {
      args = args.trim()
      var resolved = {}
      var possibleErrors = []
      this.getArguments().forEach(arg => {
        try {
          var [val, rest] = arg.validate(args)
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
     * @param {Argument} - the argument to add
     * @returns {Command} returns this to chain the command
     */
    addArgument(argument) {
      this._args.push(argument)
      return this
    }

    /**
     * Retrieves all available arguments
     * @param {Argument} - the argument to add
     * @returns {array} returns a list of defined Arguments
     */
    getArguments() {
      return this._args
    }

    /**
     * Sets the function which gets executed
     * @param {function} - the function which should be executed when the command has been validated successful
     * @returns {Command} returns this to chain Functions
     */
    exec(fnc) {
      this._storeFunction("exec", fnc)
      return this
    }

    /**
     * Dispatches a command
     * @param {object} args - the parsed arguments
     * @param {object} ev - the raw event
     */
    dispatchCommand(args, ev) {
      return this._getFunction("exec")(ev.client, args, getReplyOutput(ev), ev)
    }
  }

  /**
   * Checks if the command uses a valid command name
   * @private
   * @param {string} name the name which should be checked
   * @param {boolean} allowSingleChar wether it should allow single char commands as name
   * @returns {boolean} returns true when the command has a valid name
   */
  function validateCommandName(name, allowSingleChar = true) {
    if (typeof name !== "string") throw new Error("Expected a string as command name!")
    if (name.length === 0) throw new Error(`Command should have a minimum length of ${allowSingleChar ? "1" : "2"}!`)
    if (name.length === 1 && !allowSingleChar) throw new Error("Command should have a minimum length of 2!")
    if (!/^[a-z0-9_-]+$/i.test(name)) throw new Error("the command should match the following pattern '/^[a-z0-9_-]+$/i'")
    return true
  }

  /**
   * Creates a new Command Instance with the given Command Name
   * @name createCommand
   * @param {string} cmd - the command which should be added
   * @returns {Command} returns the created Command
   */
  function createCommand(cmd, OVERRIDES) {
    validateCommandName(cmd, OVERRIDES === "YES_I_KNOW_THAT_I_SHOULD_NOT_USE_COMMANDS_WITH_LENGTH_OF_ONE")
    debug(DEBUG.INFO)(`registering command '${cmd}'`)
    if (getCommandByName(cmd)) {
      debug(DEBUG.WARNING)(`WARNING there is already a command with name '${cmd}' enabled!`)
      debug(DEBUG.WARNING)(`Command.js may work not as expected!`)
    }
    commands.push(new Command(cmd))
    return commands[commands.length - 1]
  }

  /**
   * Creates a new CommandsCommand Instance with the given Command Name
   * @name createCommandGroup
   * @param {string} cmd - the command which should be added
   * @returns {CommandGroup} returns the created CommandGroup instance
   */
  function createCommandGroup(cmd, OVERRIDES) {
    validateCommandName(cmd, OVERRIDES === "YES_I_KNOW_THAT_I_SHOULD_NOT_USE_COMMANDS_WITH_LENGTH_OF_ONE")
    debug(DEBUG.INFO)(`registering command '${cmd}'`)
    if (getCommandByName(cmd)) {
      debug(DEBUG.WARNING)(`WARNING there is already a command with name '${cmd}' enabled!`)
      debug(DEBUG.WARNING)(`Command.js may work not as expected!`)
    }
    commands.push(new CommandGroup(cmd))
    return commands[commands.length - 1]
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
    if (Object.values(GROUP_ARGS).indexOf(type) === -1) throw new Error(`Unexpected GroupArgument type, expected one of [${Object.values(GROUP_ARGS).join(", ")}] but got ${type}!`)
    return new GroupArgument(type)
  }
 
  /**
   * Creates a new Argument Instance
   * @name getCommandByName
   * @param {string} name - the name of the command which should be retrieved
   * @returns {Command|undefined} returns the command if found otherwise undefined
   */
  function getCommandByName(name) {
    return commands.filter(cmd => cmd.getCommand() === name)[0]
  }

  /**
   * retrieves the current Command Prefix
   * @name getCommandPrefix
   * @returns {string} returns the command prefix
   */
  function getCommandPrefix() {
    var prefix = engine.getCommandPrefix()
    if (typeof prefix !== "string" || prefix.length === 0) return "!"
    return prefix
  }


  /**
   * gets all available commands
   * @name getAvailableCommands
   * @param {Client} [client] - the sinusbot client for which the commands should be retrieved if none has been omitted it will retrieve all available commands
   * @param {string|boolean} [cmd=false] - the command which should be searched for
   * @returns {Command[]} returns an array of commands
   */
  function getAvailableCommands(client, cmd = false) {
    return commands
      .filter(c => c.getCommand() === cmd || cmd === false)
      .filter(c => c.isEnabled())
      if (!client) return cmds
      return cmds.filter(c => c.isAllowed(client))
  }

  /**
   * Returns the correct reply chat from where the client has sent the message
   * @name getReplyOutput
   * @param {object} ev the sinusbot chat event
   * @param {number} ev.mode the mode from where the message came from [1=client, 2=channel, 3=server]
   * @param {Client} ev.client the sinusbot client which sent the message
   * @param {Channel} ev.channel the channel from where the command has been received
   * @returns {function} returns a function where the chat message gets redirected to
   */
  function getReplyOutput(ev) {
    switch (ev.mode) {
      case 1: return ev.client.chat.bind(ev.client)
      case 2: return ev.channel.chat.bind(ev.channel)
      case 3: return backend.chat.bind(backend)
      default: return msg => debug(DEBUG.WARNING)(`WARN no reply channel set for mode ${ev.mode}, message "${msg}" not sent!`)
    }
  }

  //creates the help command
  createCommand("help")
    .help("Displays this text")
    .manual(`Displays a list of useable commands`)
    .manual(`you can search/filter for a specific commands by adding a keyword`)
    .addArgument(createArgument("string").setName("filter").min(1).optional())
    .exec((client, {filter}, reply) => {
      console.log(`Filter ${typeof filter} ${filter}`)
      console.log(`length ${
        getAvailableCommands(client).filter(cmd => cmd.hasHelp()).length
      }`)
      var cmds = getAvailableCommands(client)
        .filter(cmd => cmd.hasHelp())
        .filter(cmd => {
          return !filter ||
            cmd.getCommand().match(new RegExp(filter, "i")) ||
            cmd.getHelp().match(new RegExp(filter, "i"))
          })
      reply(`${format.bold(cmds.length)} Commands found:`)
      cmds.forEach(cmd => reply(`${format.bold(`${getCommandPrefix()}${cmd.getCommand()}`)} - ${cmd.getHelp()}`))
    })

  //creates the man command
  createCommand("man")
    .help("Displays detailed help about a command if available")
    .manual(`Displays detailed usage help for a specific command`)
    .addArgument(createArgument("string").setName("command").min(1))
    .addArgument(createArgument("string").setName("subcommand").min(1).optional(false))
    .exec((client, {command, subcommand}, reply) => {
      var getManual = cmd => {
        if (cmd.hasManual()) return cmd.getManual()
        if (cmd.hasHelp()) return cmd.getHelp()
        return "No manual available"
      }
      var cmds = getAvailableCommands(client, command)
      if (cmds.length === 0) return reply(`No command with name ${format.bold(command)} found! Did you misstype the command?`)
      cmds.forEach(cmd => {
        if (cmd instanceof CommandGroup) {
          console.log("CommandGroup")
          cmd.getAvailableSubCommands(client, subcommand).forEach(sub => {
            console.log(cmd.getCommand(), sub.getCommand())
            reply(`\n${format.bold("Usage:")} ${getCommandPrefix()}${cmd.getCommand()} ${sub.getUsage()}\n${getManual(sub)}`)
          })
        } else {
          reply(`\nManual for command: ${format.bold(`${getCommandPrefix()}${cmd.getCommand()}`)}\n${format.bold("Usage:")} ${cmd.getUsage()}\n${getManual(cmd)}`)
        }
      })
    })


  event.on("chat", ev => {
    //do not do anything when the bot sends a message
    if (ev.client.isSelf()) return
    //get the basic command with arguments and command splitted
    var match = ev.text.match(new RegExp(`^${getCommandPrefix().split("").map(char => char.match(/[0-9\w]/) ? char : "\\"+char).join("")}(?<command>\\w*)[ \r\n]*(?<args>.*) *$`, "si"))
    //return if no valid command has been found
    if (ev.text[0] !== getCommandPrefix() && !match) return
    const { command, args } = match.groups
    //check if command exists
    var cmds = commands
      .filter(cmd => cmd.getCommand() === command)
      .filter(cmd => cmd.isEnabled())
    if (cmds.length === 0) {
      //depending on the config setting return without error
      if (config.NOT_FOUND_MESSAGE !== "0") return
      //send the not found message
      return getReplyOutput(ev)(`There is no enabled command named "${format.bold(`${getCommandPrefix()}${command}`)}", check ${format.bold(`${getCommandPrefix()}help`)} to get a list of available commands!`)
    }
    //handle every available command, should actually be only one command
    cmds.forEach(async cmd => {
      try {
        //run the cmd, this will
        // - check for permissions
        // - parse the arguments
        // - dispatch the command
        await cmd.run(args, ev)
      //catch errors, parsing errors / permission errors or anything else
      } catch(e) {
        //Handle Command not found Exceptions for CommandGroups
        if (e instanceof SubCommandNotFound) {
          getReplyOutput(ev)(e.message)
          getReplyOutput(ev)(`For Command usage see ${format.bold(`${getCommandPrefix()}man ${cmd.getCommand()}`)}`)
        } else {
          getReplyOutput(ev)("An unhandled exception occured, check the sinusbot logs for more informations")
          console.log(`#### UNHANDLED EXCEPTION (${e.constructor.name}) ####`)
          console.log(e)
        }
      }
    })
  })


  engine.export({
    createCommandGroup,
    createCommand,
    createArgument,
    createGroupedArgument,
    getCommandPrefix,
    getAvailableCommands,
    getCommandByName
  })

})
