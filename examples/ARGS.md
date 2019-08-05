Want to parse the arguments by yourself?

```javascript
//creates the command arg
command.createCommand("arg")
  //sets a helptext, this gets displayed when using the command help
  .help("example which outputs the given additional arguments")
  //this will catch all arguments
  .addArgument(args => args.rest.setName("args").optional(""))
  //this function gets executed when a command has been parsed successfully
  //the arguments which this function receives are following:
  //1) the client which has executed the command
  //2) the arguments which had been parsed
  //3) reply, depending on where the client has sent the message it will automatically reply to the client, channel or server chat
  //4) the raw text of the message
  .exec((client, { args }, reply) => {
    //the variable args will now hold all the parameters which have additionally been added after the command
    reply(`Your arguments are ${args}`)
  })
```