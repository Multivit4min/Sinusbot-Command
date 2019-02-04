# Command.js

[![Build Status](https://travis-ci.com/Multivit4min/Sinusbot-Command.svg?branch=master)](https://travis-ci.com/Multivit4min/Sinusbot-Command)

`Command.js` is a library for the SinusBot. It allows to easily create commands via the SinusBots scripting engine. This library requires the v8 engine (SinusBot version 1.0.0+) to function properly. In addition to this library comes with two base commands: `help` and `man`. 

> Work on the stuff which matters and let the command handling do someone else!

## Why should I use this library?

This library will standardize the command handling for SinusBot it will help you especially with:

  - Argument creation and validation
  - Command documentation
  - Error handling
  - Permission handling
  - Command prefix handling

## What it can't do yet

  - Localization
  
## Documentation

You can find the full documentation for this project on [Github Pages](https://multivit4min.github.io/Sinusbot-Command).

## Example

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
  //createArgument("number") creates a new argument which expects a number
  //setName("max") sets the name of the argument to identify the argument later
  //integer() tells the number argument to expect a whole number (not a floating point)
  //min(1) tells the argument that the number should be greater or equal to 1
  //optional(defaultVal) this flag tells it to be a value which does not necessarily be omitted
  //  the defaultVal will be used when no argument has been omitted
  .addArgument(Command.createArgument("number").setName("max").integer().min(1).optional(10))
  //this function gets called when validation was successful and all arguments have been parsed successful
  //client - is the user which executed the command
  //arg - is an object which holds all parsed arguments which name has been set via the arguments .setName() function
  //reply - depending on where the client has sent the message it will automatically reply to the client, channel or server chat
  //ev - the raw event which has been received
  .exec((client, { max }, reply, ev) => {
    reply(`Rolling with 0-${max}`)
    const random = require("helpers").getRandom(max)
    reply(`You rolled ${random}`)
  })
```
