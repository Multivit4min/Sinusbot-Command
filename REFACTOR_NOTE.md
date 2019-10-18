Internal:
- Renamed `TooManyArguments` Exception to `TooManyArgumentsError` for name consistency
- Renamed `SubCommandNotFound` Exception to `SubCommandNotFoundError` for name consistency
- Command#registerCommand now takes a string as parameter instead of the created Command class and will instanciate the class by itself
- Command#registerCommandGroup now takes a string as parameter instead of the created CommandGroup class and will instanciate the class by itself

Deprecation:
