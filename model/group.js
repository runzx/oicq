/**
 * 
 */
const mongoose = require('mongoose')

const { Schema, model } = mongoose
const { Mixed, ObjectId, Decimal128 } = Schema.Types

const CollectionsSchema = new Schema({
  _id: String,
  groupName: String,  // 
  // qq: String,  // 发送者qq
  qqIds: [{ type: String, ref: 'User' }],
  messages: [{
    messageId: { type: String, ref: 'message' },
    rawMessage: String,
    time: Date,
    qq: String,
    groupId: String
  }],
})

CollectionsSchema.statics = {
  updateInfo(data) {
    const { groupId, qq, receiveId, messages } = data
    const [message] = messages
    this.findByIdAndUpdate(groupId, { $push: { messages: message }, $addToSet: { qqIds: qq } }, (err, res) => {
      if (res) return
      data.qqIds = [receiveId, qq]
      data._id = groupId
      this.create(data)
    })
  },
}


module.exports = model('Group', CollectionsSchema)
