This command will send the defined **message** via **chat** or **poke** to all clients
```javascript
const backend = require("backend")
const event = require("event")

//this makes sure that all scripts have finished loading
event.on("load", () => {
  //try to load the library
  const command = require("command")
  //check if the library has been loaded successfully
  if (!command) throw new Error("command.js library not found! Please download command.js and enable it to be able use this script!")

  //creates the command mass
  command.createCommand("mass")
    //sets a helptext, this gets displayed when using the command help
    .help("sends a mass chat or poke to all clients")
    //sets a manual command this
    .manual("Usage: ${Command.getCommandPrefix()}mass <chat|poke> <message>")
    //allows the word "chat" or "poke" as second argument
    .addArgument(args => args.string.setName("action").whitelist(["chat", "poke"]).toLowerCase())
    //parsed the rest of the string, it should have a minimum length of 3
    .addArgument(args => args.rest.setName("message").min(3))
    //this function gets executed when a command has been parsed successfully
    //the arguments which this function receives are following:
    //1) the client which has executed the command
    //2) the arguments which had been parsed
    //3) reply, depending on where the client has sent the message it will automatically reply to the client, channel or server chat
    //4) the ev text of the message
    .exec((client, args, reply, ev) => {
      let sent = 0
      const ignoreUids = [client.uid(), backend.getBotClient().uid()]
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
})
```