__Command.js__
===

`Command.js` is a library for the Sinusbot it allows to easily create Commands via Sinusbots Scripting engine.
This library requires the v8 engine to function properly.
In addition this library comes with 2 base commands `help` and `man`.
Work on the stuff which matters and let the command handling do someone else!


__Why should I use this library?__

This library will standardize the command handling for Sinusbot it will help you especially with:
  - argument creation and validation
  - command documentation
  - error handling
  - permission handling
  - command prefix handling


__What it can not do YET__

  - localization
  

__Documentation__

You can find the full documentation for this project on [Github Pages](https://multivit4min.github.io/Sinusbot-Command)


__Example__

```javascript
Command.createCommand("roll")
  //displays the message when using the `!help` command
  //should be relative short message
  .help("rolls a number")
  //displays this message when using the `!man roll` command
  //more detailed documentation of what this command does
  .manual(`Rolls a number, set a number after this command to use as maximum`)
  //optional permission handling
  //takes a function which first argument will be the requesting Sinusbot Client
  .checkPermission(client => {
    //when some criterion is true
    if (someValidationCriterion(client)) {
      //return true so the library will allow the usage of the command to the client
      return true
    } else {
      //return false if you do not want the client to have access to this command
      return false
    }
  })
  //adds an optional argument
  .addArgument(Command.createArgument("number").setName("max").integer().min(1).optional())
  //this function gets called when validation was successful and all arguments have been parsed successful
  //client - is the user which executed the command
  //arg - is an object which holds all parsed arguments which name has been set via the arguments .setName() function
  //reply - depending on where the client has sent the message it will automatically reply to the client, channel or server chat
  //ev - the raw event which has been received
  .exec((client, arg, reply, ev) => {
    var max = arg.max || 10
    reply(`Rolling with 0-${max}`)
    var random = require("helpers").getRandom(max)
    reply(`You rolled ${random}`)
  })
```