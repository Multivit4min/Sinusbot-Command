In order to load this library you need to wait for the [load event](https://sinusbot.github.io/scripting-docs/#eventeventload).
After this you can import the library with `require("command")`

```javascript
  const engine = require("engine")
  const event = require("event")

  //this makes sure that all scripts have finished loading
  event.on("load", () => {
    //try to load the library
    const command = require("command")
    //check if the library has been loaded successfully
    if (!command) throw new Error("command.js library not found! Please download command.js and enable it to be able use this script!")

    //start declaring your Commands from here
    engine.log(`Command prefix is ${command.getCommandPrefix()}`)
  })
```