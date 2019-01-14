In order to load this library you need to wait for `event#load` to get fired
After this you can import the library with `require("Command")`


```javascript
  const engine = require("engine")
  const event = require("event")

  //this makes sure that all scripts have finnished loading
  event.on("load", () => {
    //try to load the library
    //BEWARE the library which comes with the bot is all lowercase!
    const Command = require("Command")
    //check if the library has been loaded successfully
    if (!Command) throw new Error("Command.js library not found! Please download Command.js and enable it to be able use this script!")

    //start declaring your Commands from here
    engine.log(`Command prefix is ${Command.getCommandPrefix()}`)
  })
```