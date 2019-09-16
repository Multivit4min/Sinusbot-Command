const { Sinusbot } = require("./node_modules/sinusbot-test-environment/lib/Sinusbot")
const fs = require("fs")

describe("Command", () => {

  /** @type {Sinusbot} */
  let sinusbot = null
  const script = fs.readFileSync("./command.js", "utf8")

  beforeEach(() => {
    sinusbot = new Sinusbot()
    sinusbot.setScript(script)
    sinusbot.setConfig({ DEBUGLEVEL: 0, NOT_FOUND_MESSAGE: "0" })
  })

  it("should test basic registration of a command", () => {
    const mockFn = jest.fn()
    const exported = sinusbot.run()
    exported.createCommand("test")
      .exec(mockFn)
    sinusbot.event.chat({ text: "!test" })
    expect(mockFn).toBeCalledTimes(1)
  })

  it("should test basic registration of a command with 2 alias", () => {
    const mockFn = jest.fn()
    const exported = sinusbot.run()
    exported.createCommand("test")
      .alias("test1", "test2")
      .exec(mockFn)
    sinusbot.event.chat({ text: "!test" })
    sinusbot.event.chat({ text: "!test1" })
    sinusbot.event.chat({ text: "!test2" })
    expect(mockFn).toBeCalledTimes(3)
  })

  it("should test a disabled command", () => {
    const mockFn = jest.fn()
    const exported = sinusbot.run()
    const client = Sinusbot.createClient()
    client.chatMock = jest.fn()
    exported.createCommand("test")
      .disable()
      .exec(mockFn)
    sinusbot.event.chat({ text: "!test", client: client.buildModule() })
    expect(mockFn).toBeCalledTimes(0)
    expect(client.chatMock).toBeCalledTimes(1)
  })
})