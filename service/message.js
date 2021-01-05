const { User, Group, Message } = require('../model')

class MessageService {
  // constructor(opt) {
  //   this.receiveId = opt.receiveId
  // }

  static userMsg(data) {
    const { receiveId, messages, messageId, qq, ...info } = this.preData(data)
    Message.create({ _id: messageId, qq, ...info, receiveId })
    messages.receiveId = receiveId
    User.updateInfo({ ...info, _id: qq, messages })
  }

  static groupMsg(data) {
    const { groupId, messages, messageId, qq, ...info } = this.preData(data)
    Message.create({ _id: messageId, qq, ...info })
    messages.qq = qq
    Group.updateInfo({ groupId, qq, messages, ...info })
    delete messages.qq
    messages.groupId = groupId
    User.updateInfo({ ...info, _id: qq, messages })
  }
  static preData(data) {
    let {
      sender,
      message,
      time,
      group_id: groupId,
      group_name: groupName,
      user_id: qq,
      sub_type: subType,
      raw_message: rawMessage,
      message_type: messageType,
      message_id: messageId,
      self_id: receiveId
    } = data
    time = time * 1000
    const { sex, card: groupNickName, area: city, ...info } = sender
    const messages = [{ time, rawMessage, messageId, }]
    return {
      sex, groupName, groupNickName, city, info, time,
      message, groupId, qq, subType, rawMessage, messageType, messageId,
      receiveId, messages, friend: [receiveId]
    }
  }
}

module.exports = { MessageService }