```javascript
const backend = require("backend")

Command.createCommand("greet")
  .help("sends greetings to the given client")
  .manual("This will send a message to the given client on the server")
  .addArgument(args => args.client.setName("uid"))
  .exec((client, args, reply, raw) => {
    const receiver = backend.getClientByUID(args.uid) 
    if (!receiver) return reply(`No online client with uid ${args.uid} found!`)
    receiver.chat(`${client.nick()} sends you his greetings!`)
    reply(`Greetings sent to ${receiver.nick()}`)
  })
```