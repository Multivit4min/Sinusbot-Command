This Command lets some defined clients use the command **!come** which will move the Sinusbot to the channel of the requesting User

```javascript
const backend = require("backend")
//uids which are allowed to use this command
const allowed = [
  "NF61yPIiDvYuOJ/Bbeod84bw6dE=",
  "Dtrx9Cf5tRP81P4gKnc3ttLo6Kk="
]

//creates the command "come"
Command.createCommad("come")
  //sets a helptext, this gets displayed when using the command help
  .help("sends the sinusbot to the channel where the client is in")
  //sets a manual command
  .manual("Usage: ${Command.getCommandPrefix()}come")
  //checks if the client is allowed to use this command
  //the function receives the requesting client as single parameter
  //the function should return true if the client is allowed to use this command
  .checkPermission(client => {
    //returns true when the client is in the list of allowed clients
    return allowed.indexOf(client.uid()) >= 0
  })
  .exec((client, args, reply, raw) => {
    var channel = client.getChannels()[0]
    if (channel === undefined) return reply("Channel you are in has not been found!")
    backend.getBotClient().moveTo(channel)
  })
```