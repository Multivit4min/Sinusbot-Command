```javascript
//create a function which uses asynchronous functions
function wait(time) {
  return new Promise(fulfill => {
    setTimeout(fulfill, time)
  })
}

const backend = require("backend")
const event = require("event")

//this makes sure that all scripts have finished loading
event.on("load", () => {
  //try to load the library
  const command = require("command")
  //check if the library has been loaded successfully
  if (!command) throw new Error("command.js library not found! Please download command.js and enable it to be able use this script!")


  //creates the command "async"
  command.createCommand("async")
    //sets a helptext, this gets displayed when using the command help
    .help("tests the aync execution")
    //this function gets executed when a command has been parsed successfully
    //the arguments which this function receives are following:
    //1) the client which has executed the command
    //2) the arguments which had been parsed
    //3) reply, depending on where the client has sent the message it will automatically reply to the client, channel or server chat
    //4) the raw text of the message
    //in order to use async functions and have correct error handling within the command.js usage do it like this
    .exec((client, args, reply, raw) => {
      //return an instance of promise
      return new Promie(async (fulfill, reject) => {
        try {
          await wait(1000)
          //resolve the function successfully
          fulfill()
        } catch (e) {
          //reject the function when an error occured
          reject(e)
        }
      })
    })
})
```