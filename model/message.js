/**
 * 
 */
const mongoose = require('mongoose')

const { Schema, model } = mongoose
const { Mixed, ObjectId, Decimal128 } = Schema.Types

const MessageSchema = new Schema({
  _id: String,
  receiveId: String,  // 接收者qq
  qq: String,  // 发送者qq
  message: {},
  time: Date,
  rawMessage: String, //
  messageType: String, // 
  groupId: String, // 
})

MessageSchema.statics = {

}


module.exports = model('Message', MessageSchema)
