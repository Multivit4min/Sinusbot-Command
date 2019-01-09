```javascript
const backend = require("backend")

//creates the command "greet"
Command.createCommad("greet")
  //sets a helptext, this gets displayed when using the command help
  .help("sends greetings to the given client")
  //sets a manual command
  .manual("Usage: ${Command.getCommandPrefix()}greet [client|uid]")
  //this expects a client or a uid
  .addArgument(Command.createArgument("client").setName("uid"))
  .exec((client, args, reply, raw) => {
    //args.uid holds the detected client uid
    var receiver = backend.getClientByUID(args.uid) 
    if (!receiver) return reply(`No online client with uid ${args.uid} found!`)
    receiver.chat(`${client.nick()} sends you his greetings!`)
    reply(`Greetings sent to ${receiver.nick()}`)
  })
```