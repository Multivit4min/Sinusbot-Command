///<reference path="node_modules/@types/jest/index.d.ts" />
///<reference path="node_modules/@types/node/index.d.ts" />

const { Sinusbot } = require("./node_modules/sinusbot-test-environment/lib/Sinusbot")
const fs = require("fs")

describe("Command", () => {

  /** @type {Sinusbot} */
  let sinusbot
  /** @type {jest.Mock} */
  let mockFn
  /** @type {any} */
  let testCmd
  /** @type {any} */
  let exported

  const script = fs.readFileSync("./command.js", "utf8")

  beforeEach(() => {
    sinusbot = new Sinusbot()
    sinusbot.setScript(script)
    sinusbot.setConfig({ DEBUGLEVEL: 0, NOT_FOUND_MESSAGE: "0" })
    mockFn = jest.fn()
    exported = sinusbot.run()
    testCmd = exported.createCommand("test")
      .exec(mockFn)
  })

  describe("General", () => {

    it("should test basic registration of a command", () => {
      return new Promise(fulfill => {
        sinusbot.event.chat({ text: "!test" })
        process.nextTick(() => {
          expect(mockFn).toBeCalledTimes(1)
          fulfill()
        })
      })
    })

    it("should test case insensitive commands", () => {
      return new Promise(fulfill => {
        testCmd = exported.createCommand("FoO").exec(mockFn)
        sinusbot.event.chat({ text: "!fOo" })
        process.nextTick(() => {
          expect(mockFn).toBeCalledTimes(1)
          fulfill()
        })
      })
    })

    it("should test basic registration of a command with 2 alias", () => {
      return new Promise(fulfill => {
        testCmd.alias("test1", "test2")
        sinusbot.event.chat({ text: "!test" })
        sinusbot.event.chat({ text: "!test1" })
        sinusbot.event.chat({ text: "!test2" })
        process.nextTick(() => {
          expect(mockFn).toBeCalledTimes(3)
          fulfill()
        })
      })
    })

    it("should test an alias with forced prefix", () => {
      return new Promise(fulfill => {
        testCmd.alias("test1")
        testCmd.forcePrefix("$")
        sinusbot.event.chat({ text: "$test" })
        sinusbot.event.chat({ text: "$test1" })
        process.nextTick(() => {
          expect(mockFn).toBeCalledTimes(2)
          fulfill()
        })
        // this should not cause addidional calls to mockFn
        sinusbot.event.chat({ text: "!test" })
        sinusbot.event.chat({ text: "!test1" })
        process.nextTick(() => {
          expect(mockFn).toBeCalledTimes(2)
          fulfill()
        })
      })
    })

    it("should test a disabled command", () => {
      return new Promise(fulfill => {
        const client = sinusbot.createClient()
        client.chatMock = jest.fn()
        testCmd.disable()
        sinusbot.event.chat({ text: "!test", client: client.buildModule() })
        process.nextTick(() => {
          expect(mockFn).toBeCalledTimes(0)
          expect(client.chatMock).toBeCalledTimes(1)
          fulfill()
        })
      })
    })

    it("should test a reenabling of a command", () => {
      return new Promise(fulfill => {
        const client = sinusbot.createClient()
        client.chatMock = jest.fn()
        testCmd.disable().enable()
        sinusbot.event.chat({ text: "!test", client: client.buildModule() })
        process.nextTick(() => {
          expect(mockFn).toBeCalledTimes(1)
          expect(client.chatMock).toBeCalledTimes(0)
          fulfill()
        })
      })
    })

    it("should test a forced prefix", () => {
      return new Promise(fulfill => {
        testCmd.forcePrefix("$")
        sinusbot.event.chat({ text: "$test" })
        process.nextTick(() => {
          expect(mockFn).toBeCalledTimes(1)
          fulfill()
        })
        // this should not cause addidional calls to mockFn
        sinusbot.event.chat({ text: "!test" })
        process.nextTick(() => {
          expect(mockFn).toBeCalledTimes(1)
          fulfill()
        })
      })
    })

    it("should test denied permissions", () => {
      return new Promise(fulfill => {
        testCmd.checkPermission(() => false)
        sinusbot.event.chat({ text: "!test" })
        process.nextTick(() => {
          expect(mockFn).toBeCalledTimes(0)
          fulfill()
        })
      })
    })

    it("should test allowed permissions", () => {
      return new Promise(fulfill => {
        testCmd.checkPermission(() => true)
        sinusbot.event.chat({ text: "!test" })
        process.nextTick(() => {
          expect(mockFn).toBeCalledTimes(1)
          fulfill()
        })
      })
    })

    describe("invalid commands", () => {
      it("should check if a command throws an error on registration with a space in it", () => {
        expect(() => exported.createCommand("te st")).toThrowError()
      })

      it("should check if a command throws an error on registration with a carriage return", () => {
        expect(() => exported.createCommand("te\rst")).toThrowError()
      })

      it("should check if a command throws an error on registration with a new line", () => {
        expect(() => exported.createCommand("te\nst")).toThrowError()
      })

      it("should check if a command throws an error on registration with a tab", () => {
        expect(() => exported.createCommand("te\tst")).toThrowError()
      })
    })
  })

  describe("CommandGroup", () => {

  /** @type {Sinusbot} */
  let sinusbot
  /** @type {jest.Mock} */
  let mockFn
  /** @type {any} */
  let cmdGroup = null
  /** @type {any} */
  let exported = null

  const script = fs.readFileSync("./command.js", "utf8")

  beforeEach(() => {
    sinusbot = new Sinusbot()
    sinusbot.setScript(script)
    sinusbot.setConfig({ DEBUGLEVEL: 0, NOT_FOUND_MESSAGE: "0" })
    mockFn = jest.fn()
    exported = sinusbot.run()
    cmdGroup = exported.createCommandGroup("test")
  })

  it("should test the basic registration of a CommandGroup", () => {
    return new Promise(fulfill => {
      cmdGroup.addCommand("foo").exec(mockFn)
      sinusbot.event.chat({ text: "!test foo" })
      process.nextTick(() => {
        expect(mockFn).toBeCalledTimes(1)
        fulfill()
      })
    })
  })

  it("should test the case insensitivity of a CommandGroup", () => {
    return new Promise(fulfill => {
      cmdGroup = exported.createCommandGroup("FoO")
      cmdGroup.addCommand("bAr").exec(mockFn)
      sinusbot.event.chat({ text: "!fOo BaR" })
      process.nextTick(() => {
        expect(mockFn).toBeCalledTimes(1)
        fulfill()
      })
    })
  })

  it("should test alias of a Command in a CommandGroup", () => {
    return new Promise(fulfill => {
      cmdGroup = exported.createCommandGroup("foo")
      cmdGroup.addCommand("bar").alias("b").exec(mockFn)
      sinusbot.event.chat({ text: "!foo b" })
      process.nextTick(() => {
        expect(mockFn).toBeCalledTimes(1)
        fulfill()
      })
    })
  })

  it("should test denied permissions of a CommandGroup", () => {
    return new Promise(fulfill => {
      cmdGroup = exported.createCommandGroup("foo").checkPermission(() => false)
      cmdGroup.addCommand("bar").exec(mockFn)
      sinusbot.event.chat({ text: "!foo bar" })
      process.nextTick(() => {
        expect(mockFn).toBeCalledTimes(0)
        fulfill()
      })
    })
  })

  it("should test denied permissions of a Command in a CommandGroup", () => {
    return new Promise(fulfill => {
      cmdGroup = exported.createCommandGroup("foo")
      cmdGroup.addCommand("bar").checkPermission(() => false).exec(mockFn)
      cmdGroup.addCommand("baz").checkPermission(() => true).exec(mockFn)
      sinusbot.event.chat({ text: "!foo bar" })
      process.nextTick(() => {
        expect(mockFn).toBeCalledTimes(0)
        fulfill()
      })
    })
  })

  it("should test allowed permissions of a Command in a CommandGroup", () => {
    return new Promise(fulfill => {
      cmdGroup = exported.createCommandGroup("foo")
      cmdGroup.addCommand("bar").checkPermission(() => true).exec(mockFn)
      cmdGroup.addCommand("baz").checkPermission(() => false).exec(mockFn)
      sinusbot.event.chat({ text: "!foo bar" })
      process.nextTick(() => {
        expect(mockFn).toBeCalledTimes(1)
        fulfill()
      })
    })
  })


})


  describe("Arguments", () => {

    describe("StringArgument", () => {

      it("should test the basic assignment of a string", () => {
        return new Promise(fulfill => {
          testCmd.addArgument((/** @type {object} */ args) => args.string.setName("bar"))
          sinusbot.event.chat({ text: "!test Foo" })
          process.nextTick(() => {
            expect(mockFn).toBeCalledTimes(1)
            expect(mockFn.mock.calls[0][1]).toEqual({ bar: "Foo" })
            fulfill()
          })
        })
      })
      it("should test the forceUpperCase method", () => {
        return new Promise(fulfill => {
          testCmd.addArgument((/** @type {object} */ args) => args.string.setName("bar").forceUpperCase())
          sinusbot.event.chat({ text: "!test Foo" })
          process.nextTick(() => {
            expect(mockFn).toBeCalledTimes(1)
            expect(mockFn.mock.calls[0][1]).toEqual({ bar: "FOO" })
            fulfill()
          })
        })
      })
      it("should test the forceLowerCase method", () => {
        return new Promise(fulfill => {
          testCmd.addArgument((/** @type {object} */ args) => args.string.setName("bar").forceLowerCase())
          sinusbot.event.chat({ text: "!test Foo" })
          process.nextTick(() => {
            expect(mockFn).toBeCalledTimes(1)
            expect(mockFn.mock.calls[0][1]).toEqual({ bar: "foo" })
            fulfill()
          })
        })
      })
      it("should test the forceLowerCase method", () => {
        return new Promise(fulfill => {
          
          testCmd.addArgument((/** @type {object} */  args) => args.string.setName("bar").forceLowerCase())
          sinusbot.event.chat({ text: "!test Foo" })
          process.nextTick(() => {
            expect(mockFn).toBeCalledTimes(1)
            expect(mockFn.mock.calls[0][1]).toEqual({ bar: "foo" })
            fulfill()
          })
        })
      })
      it("should test the match regex", () => {
        return new Promise(fulfill => {
          testCmd.addArgument((/** @type {object} */ args) => args.string.setName("bar").match(/^fOo$/))
          sinusbot.event.chat({ text: "!test fOo" })
          process.nextTick(() => {
            expect(mockFn).toBeCalledTimes(1)
            expect(mockFn.mock.calls[0][1]).toEqual({ bar: "fOo" })
            mockFn.mockClear()
            sinusbot.event.chat({ text: "!test foo" })
            expect(mockFn).toBeCalledTimes(0)
            fulfill()
          })
        })
      })
      it("should test the max length", () => {
        return new Promise(fulfill => {
          testCmd.addArgument((/** @type {object} */ args) => args.string.setName("bar").max(3))
          sinusbot.event.chat({ text: "!test foo" })
          process.nextTick(() => {
            expect(mockFn).toBeCalledTimes(1)
            expect(mockFn.mock.calls[0][1]).toEqual({ bar: "foo" })
            mockFn.mockClear()
            sinusbot.event.chat({ text: "!test fooo" })
            expect(mockFn).toBeCalledTimes(0)
            fulfill()
          })
        })
      })
      it("should test the min length", () => {
        return new Promise(fulfill => {
          testCmd.addArgument((/** @type {object} */ args) => args.string.setName("bar").min(3))
          sinusbot.event.chat({ text: "!test foo" })
          process.nextTick(() => {
            expect(mockFn).toBeCalledTimes(1)
            expect(mockFn.mock.calls[0][1]).toEqual({ bar: "foo" })
            mockFn.mockClear()
            sinusbot.event.chat({ text: "!test fo" })
            expect(mockFn).toBeCalledTimes(0)
            fulfill()
          })
        })
      })
      it("should test the whitelist method", () => {
        return new Promise(fulfill => {
          testCmd.addArgument((/** @type {object} */ args) => args.string.setName("bar").whitelist(["foo", "bar"]))
          sinusbot.event.chat({ text: "!test foo" })
          process.nextTick(() => {
            expect(mockFn).toBeCalledTimes(1)
            expect(mockFn.mock.calls[0][1]).toEqual({ bar: "foo" })
            mockFn.mockClear()
            sinusbot.event.chat({ text: "!test baz" })
            expect(mockFn).toBeCalledTimes(0)
            fulfill()
          })
        })
      })
    })

  })
})