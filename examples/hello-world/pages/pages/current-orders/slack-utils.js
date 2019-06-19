import axios from "axios";

export const lookupEmail = async email => {
  const {
    data: {
      user: {
        id: userId,
        profile: { display_name: displayName }
      }
    }
  } = await axios.get("//slack.com/api/users.lookupByEmail", {
    params: {
      token: process.env.SLACK_OAUTH,
      email
    }
  });

  return { userId, displayName };
};

export const getChannel = async userId => {
  const formData = new FormData();
  formData.append("token", process.env.SLACK_OAUTH);
  formData.append("user", userId);
  const {
    data: {
      channel: { id: channelId }
    }
  } = await axios.post("//slack.com/api/im.open", formData);

  return channelId;
};

export const dm = async (channelId, message) => {
  const formData = new FormData();
  formData.append("token", process.env.SLACK_OAUTH);
  formData.append("channel", channelId);
  formData.append("text", message);
  const {
    data: { ok: status }
  } = await axios.post("//slack.com/api/chat.postMessage", formData);

  return status;
};
