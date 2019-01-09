This command will send one or more pongs to the clients

```javascript
Command.createCommad("ping")
  //sets a helptext, this gets displayed when using the command help
  .help("replies n times with Pong!")
  //sets a manual command this
  .manual("Usage: ${Command.getCommandPrefix()}ping [amount]")
  //creates a number argument with the name "amount" a number of 1 to 10 is allowed
  .addArgument(Command.createArgument("number").setName("amount").min(1).max(10).optional())
  //this function gets executed when a command has been parsed successfully
  //the arguments which this function receives are following:
  //1) the client which has executed the command
  //2) the arguments which had been parsed
  //3) reply, depending on where the client has sent the message it will automatically reply to the client, channel or server chat
  //4) the raw text of the message
  .exec((client, args, reply, raw) => {
    //args.amount is undefined when the client sent only 
    var amount = args.amount ? args.amount : 1 
    while (amount > 0) {
      reply("Pong!")
      amount--
    }
  })
```