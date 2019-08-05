This command will send one or more pongs to the clients

```javascript
Command.createCommand("ping")
  //sets a helptext, this gets displayed when using the command help
  .help("replies n times with Pong!")
  //sets a manual command this
  .manual("replies at least one time with ping")
  //the second manual command will add it as new line
  //looks better than having an ultra long string
  .manual("depending on the number given it will replies with this amount of pongs")
  //creates a number argument with the name "amount" a number of 1 to 10 is allowed
  .addArgument(args => args.number.setName("amount").min(1).max(10).optional(1))
  //this function gets executed when a command has been parsed successfully
  //the arguments which this function receives are following:
  //1) the client which has executed the command
  //2) the arguments which had been parsed
  //3) reply, depending on where the client has sent the message it will automatically reply to the client, channel or server chat
  //4) the raw text of the message
  .exec((client, { amount }, reply, raw) => {
    Array(amount).fill().forEach(() => reply("Pong!"))
  })
```