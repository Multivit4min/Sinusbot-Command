__Command.js__
===

`Command.js` is a library for the Sinusbot it allows to easily create Commands via Sinusbots Scripting engine.
This library requires the v8 engine to function properly.
In addition this library comes with 2 base commands `help` and `man`.
This library will also take care that it uses the right Prefix which has been defined inside the Instance Settings.

Documentation
===

You can find the full documentation for this project on [Github Pages](https://multivit4min.github.io/Sinusbot-Command)


Example
===
```javascript
createCommand("roll")
  .help("rolls a number")
  .manual(`Rolls a number, set a number after this command to use as maximum`)
  .addArgument(createArgument("number").setName("max").integer().min(1).optional())
  .exec((client, arg, reply) => {
    var max = arg.max || 10
    reply(`Rolling with 0-${max}`)
    var random = require("helpers").getRandom(max)
    reply(`You rolled ${random}`)
  })
```