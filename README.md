__Command.js__
===

`Command.js` is a library for the Sinusbot it allows to easily create Commands via Sinusbots Scripting engine.
This library requires the v8 engine to function properly.
In addition this library comes with 2 base commands `help` and `man`.
This library will also take care that it uses the right Prefix which has been defined inside the Instance Settings.

Example
===
```javascript
createCommand("roll")
  .setHelp("rolls a number")
  .setManual(`Rolls a number, set a number after this command to use as maximum`)
  .addArgument(createArgument("number").setName("max").integer().min(1).optional())
  .exec((client, arg) => {
    var max = arg.max || 10
    client.chat(`Rolling with 0-${max}`)
    var random = require("helpers").getRandom(max)
    client.chat(`You rolled ${random}`)
  })
```


exported function `createCommand()`
===

The function createCommand will create a new instance of `Command`, as first parameter it expects the name of the command and will return the `Command` class.


exported function `createArgument()`
===

The function createArgument will create a new instance of the specified `Argument` type, as first parameter it expects the argument type and will return the `Argument` class.

Valid Argument types are
- `string` to create a  `StringArgument`
- `number` to create a `NumberArgument`
- `client` to create a `ClientArgument`
- `rest` to create a `RestArgument`


class `Command`
===

`#getCommand()`

retrieves the actual command name as string

`#addAlias(...alias)`

sets one or more alias for this command
takes one or more strings as argument

`#getAlias()`

returns an array of aliases to this command

`#setHelp(text)`

sets the help text for this command, this should be a very short description for what the command is for

`#hasHelp()`

returns true if a help text has been defined for this command

`#getHelp()`

returns the defined help text for this command

`#setManual(text)`

sets a manual text which will used as a description when a client uses the _!man_ command

`#hasManual()`

returns true if a manual has been defined for this command

`#getManual()`

returns the defined manual text for the command

`#checkPermission(fnc)`

the function which checks if a client is allowed to use the command
the function will receive the sinusbot client as first argument
it should return true when the client is allowed to use the specified command

`#isAllowed(client)`

checks wether a client is allowed to use the specified command
takes as first argument a sinusbot client object and returns true if the client is allowed to use the command

`#addArgument(arg)`

registers a new Argument to the command

`#getArguments()`

returns all created arguments as an array

`#exec(fnc)`

The function which gets executed after permission check was successfull and all arguments had been parsed successfully.
Takes a function as argument, the function gets called with the sinusbot client object as first parameter and the parsed arguments as second parameter

`#ignoreTooManyArgs()`

If this function gets called the Command ignores too many omitted arguments and will not throw an error

`#shouldIgnoreTooManyArgs()`

returns true if the #ignoreTooManyArgs() function has been called before

`#destroy()`

Should be called when the Script gets unloaded on each registered Command


class `Argument`
===

this is the abstract class for all other Arguments, all functions of this class are available in all other Argument classes


`#optional()`

sets this argument as optional, if a parse error occurs then this Argument will be skipped

`#isOptional()`

returns true if the Argument has been marked as optional

`#setName(name)`

sets the name of the argument, this name should contain only a-z, 0-9 or _ .
This name will be used when the argument gets omitted to the #exec() function of the Command class

`#getName()`

retrieves the name which has been set via the function #setName()


class `StringArgument`
===

this Argument expects a String

`#max(count)`

sets the maximum char count which the argument expects

`#min(count)`

sets the minimum char count which the argument expects

`#forceUpperCase()`

forces uppercase letters and will automatically rewrite any input to uppercase letters

`#forceLowerCase()`

forces lowercase letters and will automatically rewrite any input to lowercase letters

`#whitelist(words)`

adds the specified array of words to the whitelist only this words are then allowed to be used as argument


class `RestArgument`
===

this argument will parse everything additional and should be used as last argument
this class has all functions which the StringArgument class has, the only thing which is different is that it allows whitespaces


class `ClientArgument`
===

This class has no additional functions, but it expects either a client uid or a client url, it will then return the detected uid



class `NumberArgument`
===

This Argument class can be used to parse a number

`#min(n)`

This sets the Argument to expect the given number n as smallest possible input

`#max(n)`

This sets the Argument to expect the given number n as highest possible input

`#integer()`

This sets the Argument to expect an integer (no floating point number)

`#positive()`

This sets the Argument to expect a positive number

`#negative()`

This sets the Argument to expect a negative number
