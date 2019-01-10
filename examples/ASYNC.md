```javascript
const backend = require("backend")

//create a function which uses asynchronous functions
function wait(time) {
  return new Promise(fulfill => {
    setTimeout(fulfill, time)
  })
}

//creates the command "async"
Command.createCommad("async")
  //sets a helptext, this gets displayed when using the command help
  .help("tests the aync execution")
  //in order to use async functions and have correct error handling within the Command.js usage do it like this
  .exec((client, args, reply, raw) => {
    //return a instance of promise
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
```