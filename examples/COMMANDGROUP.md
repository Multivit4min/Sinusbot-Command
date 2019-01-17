This will create a command with multiple sub commands.
For example to implement a command which handles money
!money add 10
!money remove 5

```javascript
//this will return an instance of the GroupCommand class
//most methods from the Command class are available here also
var moneyCommand = Command.createCommandGroup("money")
  //sets a helptext, this gets displayed when using the command help
  .help("manages the money of users")
  //you can use exec here aswell but you are not able to add any Arguments!

//the addCommand method will create a new instance of the SubCommand class
//this class is basically the same as the basic Command class
//if a user sends `!money add x` then this command gets executed
moneyCommand.addCommand("add")
  .help("Adds a certain amount of money to you")
  .addArgument(createArgument("number").setName("amount").min(1))
  .exec((client, args, reply) => {
    //add money to the user
  })

//you can create multiple sub commands when calling again addCommand on the commandGroup class
//if a user sends `!money remove x` then this command gets executed
moneyCommand.addCommand("remove")
  .help("Removes a certain amounf of money from you")
  .addArgument(createArgument("number").setName("amount").min(1))
  .exec((client, args, reply) => {
    //remove money from a user
  })

```