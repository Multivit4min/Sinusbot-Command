This command will send the defined **message** via **chat** or **poke** to all clients

```javascript
const backend = require("backend")

//creates the command mass
Command.createCommad("mass")
  //sets a helptext, this gets displayed when using the command help
  .help("sends a mass chat or poke to all clients")
  //sets a manual command this
  .manual("Usage: ${Command.getCommandPrefix()}mass <chat|poke> <message>")
  //allows the word "chat" or "poke" as second argument
  .addArgument(Command.createArgument("string").setName("action").whitelist(["chat", "poke"]).toLowerCase())
  //parsed the rest of the string, it should have a minimum length of 3
  .addArgument(Command.createArgument("rest").setName("message").min(3))
  //this function gets executed when a command has been parsed successfully
  //the arguments which this function receives are following:
  //1) the client which has executed the command
  //2) the arguments which had been parsed
  //3) reply, depending on where the client has sent the message it will automatically reply to the client, channel or server chat
  //4) the raw text of the message
  .exec((client, args, reply, raw) => {
    var sent = 0
    var ignoreUids = [client.uid(), backend.getBotClient().uid()]
    backend.getClients().forEach(client => {
      if (ignoreUids === client.uid()) return
      sent++
      if (args.action === "poke") {
        client.chat(args.message)
      } else {
        client.poke(args.message)
      }
    })
    reply(`Message has been sent to ${sent} Clients!`)
  })
```