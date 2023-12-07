import { ApiClient } from "@twurple/api"
import type { RefreshingAuthProvider } from "@twurple/auth"
import { ChatClient, LogLevel } from "@twurple/chat"

import { BotCommand } from "./BotCommand"
import { BotCommandContext } from "./BotCommandContext"
import type { ChatMessage } from "./ChatMessage"
import type { CommandData } from "./CommandData"

const prefix = "!"

export class Bot {
  private readonly authProvider: RefreshingAuthProvider
  private readonly api: ApiClient
  private readonly chat: ChatClient

  // Keys: the canonical command name (so no aliases go here)
  private readonly commands = new Map<string, BotCommand>()

  // Keys: alias name, values: canonical command name
  private readonly aliases = new Map<string, string>()

  constructor({ authProvider }: { authProvider: RefreshingAuthProvider }) {
    this.authProvider = authProvider
    console.info("Created the bot, but it's not doing anything yet")

    const logLevel = LogLevel.ERROR
    this.api = new ApiClient({
      authProvider,
      logger: { minLevel: logLevel },
    })
    this.chat = new ChatClient({
      logger: { minLevel: logLevel },
      authProvider,

      // This prevents us from having user-level rate limits
      isAlwaysMod: true,
      // TODO: stop hard-coding this
      channels: ["AdamLearnsLive"],
    })

    // We need to process msg because it has all of the information and we may need that to determine whether someone typed a command
    this.chat.onMessage(this.onMessage)
    this.chat.connect()
  }

  addTextCommand(name: string, response: string) {
    const command = new BotCommand(
      name,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      async (_params: string[], context: BotCommandContext) => {
        console.info(`You typed ${name}. The response is: ${response}`)
        await context.say(response)
      },
    )

    this.commands.set(name, command)
  }

  addAlias(alias: string, targetCommandName: string) {
    if (this.commands.has(alias)) {
      throw new Error("Alias name is already taken by a command")
    }

    if (this.aliases.has(alias)) {
      if (this.aliases.get(alias) === targetCommandName) {
        return
      }
      throw new Error("Alias name is already taken by another alias")
    }

    this.aliases.set(alias, targetCommandName)
  }

  async say(channel: string, message: string) {
    await this.chat.say(channel, message)
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getCommandAndParams(text: string, _message: ChatMessage): CommandData | null {
    const [command, ...params] = text.split(" ")
    if (!command?.startsWith(prefix)) {
      return null
    }
    const sliced = command.slice(prefix.length)
    return {
      params,
      name: sliced,
    }
  }

  private processPotentialCommand = async (
    channel: string,
    user: string,
    text: string,
    msg: ChatMessage,
  ) => {
    const commandData = this.getCommandAndParams(text, msg)

    if (commandData === null) {
      return
    }

    let commandName = commandData.name
    const commandNameFromAlias = this.aliases.get(commandData.name)
    if (commandNameFromAlias !== undefined) {
      commandName = commandNameFromAlias
    }

    const command = this.commands.get(commandName)
    if (command === undefined) {
      return
    }

    const context = new BotCommandContext(this, msg)
    await command.execute(commandData.params, context)
  }

  private onMessage = async (
    channel: string,
    user: string,
    text: string,
    msg: ChatMessage,
  ) => {
    console.info(
      `Channel: ${channel}, User: ${user}, Text: ${text}, msg: ${JSON.stringify(
        msg,
      )}`,
    )

    await this.processPotentialCommand(channel, user, text, msg)
  }
}
