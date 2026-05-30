import type { A2UIMessage } from "./protocol.ts";

export type A2UIReplayPlan = {
  reset: boolean;
  messages: A2UIMessage[];
};

export function planA2UIReplay(
  previousMessages: A2UIMessage[],
  nextMessages: A2UIMessage[],
): A2UIReplayPlan {
  const sharedLength = Math.min(previousMessages.length, nextMessages.length);

  for (let index = 0; index < sharedLength; index += 1) {
    if (!areMessagesEqual(previousMessages[index], nextMessages[index])) {
      return {
        reset: true,
        messages: nextMessages,
      };
    }
  }

  if (nextMessages.length < previousMessages.length) {
    return {
      reset: true,
      messages: nextMessages,
    };
  }

  return {
    reset: false,
    messages: nextMessages.slice(previousMessages.length),
  };
}

function areMessagesEqual(left: A2UIMessage, right: A2UIMessage) {
  return JSON.stringify(left) === JSON.stringify(right);
}
