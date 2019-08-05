```javascript
const backend = require("backend")
const event = require("event")

//this makes sure that all scripts have finished loading
event.on("load", () => {
  //try to load the library
  const command = require("command")
  //check if the library has been loaded successfully
  if (!command) throw new Error("command.js library not found! Please download command.js and enable it to be able use this script!")

  command.createCommand("greet")
    .help("sends greetings to the given client")
    .manual("This will send a message to the given client on the server")
    .addArgument(args => args.client.setName("uid"))
    .exec((client, args, reply, raw) => {
      const receiver = backend.getClientByUID(args.uid) 
      if (!receiver) return reply(`No online client with uid ${args.uid} found!`)
      receiver.chat(`${client.nick()} sends you his greetings!`)
      reply(`Greetings sent to ${receiver.nick()}`)
    })
})
```