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
      sinusbot.event.chat({ text: "!test" })
      expect(mockFn).toBeCalledTimes(1)
    })

    it("should test case insensitive commands", () => {
      testCmd = exported.createCommand("FoO").exec(mockFn)
      sinusbot.event.chat({ text: "!fOo" })
      expect(mockFn).toBeCalledTimes(1)
    })

    it("should test basic registration of a command with 2 alias", () => {
      testCmd.alias("test1", "test2")
      sinusbot.event.chat({ text: "!test" })
      sinusbot.event.chat({ text: "!test1" })
      sinusbot.event.chat({ text: "!test2" })
      expect(mockFn).toBeCalledTimes(3)
    })

    it("should test a disabled command", () => {
      const client = Sinusbot.createClient()
      client.chatMock = jest.fn()
      testCmd.disable()
      sinusbot.event.chat({ text: "!test", client: client.buildModule() })
      expect(mockFn).toBeCalledTimes(0)
      expect(client.chatMock).toBeCalledTimes(1)
    })

    it("should test a reenabling of a command", () => {
      const client = Sinusbot.createClient()
      client.chatMock = jest.fn()
      testCmd.disable().enable()
      sinusbot.event.chat({ text: "!test", client: client.buildModule() })
      expect(mockFn).toBeCalledTimes(1)
      expect(client.chatMock).toBeCalledTimes(0)
    })

    it("should test a forced prefix", () => {
      testCmd.forcePrefix("$")
      sinusbot.event.chat({ text: "$test" })
      sinusbot.event.chat({ text: "!test" })
      expect(mockFn).toBeCalledTimes(1)
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
    cmdGroup.addCommand("foo").exec(mockFn)
    sinusbot.event.chat({ text: "!test foo" })
    expect(mockFn).toBeCalledTimes(1)
  })

  it("should test the case insensitivity of a CommandGroup", () => {
    cmdGroup = exported.createCommandGroup("FoO")
    cmdGroup.addCommand("bAr").exec(mockFn)
    sinusbot.event.chat({ text: "!fOo BaR" })
    expect(mockFn).toBeCalledTimes(1)
  })

  it("should test alias of a Command in a CommandGroup", () => {
    cmdGroup = exported.createCommandGroup("foo")
    cmdGroup.addCommand("bar").alias("b").exec(mockFn)
    sinusbot.event.chat({ text: "!foo b" })
    expect(mockFn).toBeCalledTimes(1)
  })

})


  describe("Arguments", () => {

    describe("StringArgument", () => {

      it("should test the basic assignment of a string", () => {
        testCmd.addArgument(args => args.string.setName("bar"))
        sinusbot.event.chat({ text: "!test Foo" })
        expect(mockFn).toBeCalledTimes(1)
        expect(mockFn.mock.calls[0][1]).toEqual({ bar: "Foo" })
      })
      it("should test the forceUpperCase method", () => {
        testCmd.addArgument(args => args.string.setName("bar").forceUpperCase())
        sinusbot.event.chat({ text: "!test Foo" })
        expect(mockFn).toBeCalledTimes(1)
        expect(mockFn.mock.calls[0][1]).toEqual({ bar: "FOO" })
      })
      it("should test the forceLowerCase method", () => {
        testCmd.addArgument(args => args.string.setName("bar").forceLowerCase())
        sinusbot.event.chat({ text: "!test Foo" })
        expect(mockFn).toBeCalledTimes(1)
        expect(mockFn.mock.calls[0][1]).toEqual({ bar: "foo" })
      })
      it("should test the forceLowerCase method", () => {
        testCmd.addArgument(args => args.string.setName("bar").forceLowerCase())
        sinusbot.event.chat({ text: "!test Foo" })
        expect(mockFn).toBeCalledTimes(1)
        expect(mockFn.mock.calls[0][1]).toEqual({ bar: "foo" })
      })
      it("should test the match regex", () => {
        testCmd.addArgument(args => args.string.setName("bar").match(/^fOo$/))
        sinusbot.event.chat({ text: "!test fOo" })
        expect(mockFn).toBeCalledTimes(1)
        expect(mockFn.mock.calls[0][1]).toEqual({ bar: "fOo" })
        mockFn.mockClear()
        sinusbot.event.chat({ text: "!test foo" })
        expect(mockFn).toBeCalledTimes(0)
      })
      it("should test the max length", () => {
        testCmd.addArgument(args => args.string.setName("bar").max(3))
        sinusbot.event.chat({ text: "!test foo" })
        expect(mockFn).toBeCalledTimes(1)
        expect(mockFn.mock.calls[0][1]).toEqual({ bar: "foo" })
        mockFn.mockClear()
        sinusbot.event.chat({ text: "!test fooo" })
        expect(mockFn).toBeCalledTimes(0)
      })
      it("should test the min length", () => {
        testCmd.addArgument(args => args.string.setName("bar").min(3))
        sinusbot.event.chat({ text: "!test foo" })
        expect(mockFn).toBeCalledTimes(1)
        expect(mockFn.mock.calls[0][1]).toEqual({ bar: "foo" })
        mockFn.mockClear()
        sinusbot.event.chat({ text: "!test fo" })
        expect(mockFn).toBeCalledTimes(0)
      })
      it("should test the whitelist method", () => {
        testCmd.addArgument(args => args.string.setName("bar").whitelist(["foo", "bar"]))
        sinusbot.event.chat({ text: "!test foo" })
        expect(mockFn).toBeCalledTimes(1)
        expect(mockFn.mock.calls[0][1]).toEqual({ bar: "foo" })
        mockFn.mockClear()
        sinusbot.event.chat({ text: "!test baz" })
        expect(mockFn).toBeCalledTimes(0)
      })
    })

  })
})