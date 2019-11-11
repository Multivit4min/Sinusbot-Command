### 1.4.3 - Unreleased
* added checks to prevent erros on old versions

### 1.4.2 - 08.11.2019
* added command usage logging
* respect ignore settings for server/channel/private chat

### 1.4.1 - 23.10.2019
* fixed missing permission check
* added tests to prevent missing permission checks

### 1.4.0 - 20.10.2019
* refactoring of the code base see `REFACTOR_NOTE.md`
* checkPermissions now allows Promise responses
* show alias inside man command
* commands are now case insensitive
* teamspeak now sends less seperat chat commands when using the help command
* added a few tests

### 1.3.1 - 03.08.2019
* added new possibility to create arguments
```javascript
  createCommand("foo")
    .addArgument(args => args.number.setName("bar").positive())
```

### 1.3.0 - 11.06.2019
* added better support for message events from discord

### 1.2.3 - 14.04.2019
* fixed GroupArguments

### 1.2.2 - 10.02.2019
* reworked responses especially for discord
* ClientArgument should now work with discord

### 1.2.1 - 09.02.2019
* improved error handling messages
* improved man command (the command `!man !help` will now resolve to the help command aswell)

### 1.2.0 - 05.02.2019
* implemented command throttling
* added method #getVersion() to retrieve the current semantic version string

### 1.1.3 - 04.02.2018
* changed help output for discord

### 1.1.2 - 30.01.2018
* changed error handling for PermissionError

### 1.1.1 - 17.01.2019
* changed error handling for failing permission checks
* fixed client object not passed to the checkPermission Parent of a CommandGroup

### 1.1.0 - 17.01.2019
* added createCommandGroup to create a CommandGroup with multiple SubCommands for simpler handling of complex commands
* refactored command handling
* set default config value for `NOT_FOUND_MESSAGE` to `"1"`
* moved `getCommandByName` to CommandCollector
* moved `getAvailableCommands` to CommandCollector
* moved multiple log messages to VERBOSE logging
* fixed documentation
* removed alias from commands for the sake of simplicity
* removed method ignoreOptionalArgs to enforce a more strict parsing

### 1.0.1 - 14.01.2019
* fixed a bug when the prefix has been removed from the instance settings

### 1.0.0 - 10.12.2018
* initial release