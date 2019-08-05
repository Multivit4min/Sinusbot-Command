This command lets some defined clients use the command **!come** which will move the Sinusbot to the channel of the requesting User

```javascript
const backend = require("backend")
//uids which are allowed to use this command
const allowed = [
  "NF61yPIiDvYuOJ/Bbeod84bw6dE=",
  "Dtrx9Cf5tRP81P4gKnc3ttLo6Kk="
]

const backend = require("backend")
const event = require("event")

//this makes sure that all scripts have finished loading
event.on("load", () => {
  //try to load the library
  const command = require("command")
  //check if the library has been loaded successfully
  if (!command) throw new Error("command.js library not found! Please download command.js and enable it to be able use this script!")

  //creates the command "come"
  command.createCommand("come")
    //sets a helptext, this gets displayed when using the command help
    .help("moves the sinusbot to your channel")
    //sets a manual command
    .manual("This will let Sinusbot join into your channel")
    //checks if the client is allowed to use this command
    //the function receives the requesting client as single parameter
    //the function should return true if the client is allowed to use this command
    //BEWARE this function gets called on every help command and everytime the client tries to execute the command
    //so this function should not have any CPU/IO intense tasks
    .checkPermission(client => {
      //returns true when the client is in the list of allowed clients
      return allowed.includes(client.uid())
    })
    //this function gets executed when a command has been parsed successfully
    //the arguments which this function receives are following:
    //1) the client which has executed the command
    //2) the arguments which had been parsed
    //3) reply, depending on where the client has sent the message it will automatically reply to the client, channel or server chat
    //4) the raw text of the message
    .exec((client, args, reply, raw) => {
      const channel = client.getChannels()[0]
      if (channel === undefined) return reply("Channel you are in has not been found!")
      backend.getBotClient().moveTo(channel)
    })
})
```