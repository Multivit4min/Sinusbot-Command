```javascript
const backend = require("backend")

//creates the command "greet"
Command.createCommand("greet")
  //sets a helptext, this gets displayed when using the command help
  .help("sends greetings to the given client")
  //sets a manual command
  .manual("This will send a message to the given client on the server")
  //this expects a client or a uid it will return the detected uid
  .addArgument(Command.createArgument("client").setName("uid"))
  //this function gets executed when a command has been parsed successfully
  //the arguments which this function receives are following:
  //1) the client which has executed the command
  //2) the arguments which had been parsed
  //3) reply, depending on where the client has sent the message it will automatically reply to the client, channel or server chat
  //4) the raw text of the message
  .exec((client, args, reply, raw) => {
    //args.uid holds the detected client uid
    const receiver = backend.getClientByUID(args.uid) 
    if (!receiver) return reply(`No online client with uid ${args.uid} found!`)
    receiver.chat(`${client.nick()} sends you his greetings!`)
    reply(`Greetings sent to ${receiver.nick()}`)
  })
```