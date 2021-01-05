const mongoose = require('mongoose')
const Sequence = require('./sequence')
// const bcryptjs = require('bcryptjs')
// const { RepeatExcseption, ParametersException } = require('../../core/exception')
// const { authsToPermission } = require('../lib/permission')

const SALT_WORK_FACTOR = 10
const { Schema, model } = mongoose
const { Mixed, ObjectId, Decimal128 } = Schema.Types

const userSchema = new Schema(
  {
    _id: String, // qq: String,  // user_id
    no: Number,
    name: String,
    age: Number,
    nickName: { type: String, alias: 'nickname' }, // 和微信字段一至
    avatarUrl: { type: String, alias: 'avatar' },
    language: String, // "zh_CN"
    city: String,     // "Kunming"
    province: String, // "Yunnan"
    country: String,  // "China"
    gender: { type: Number }, //性别 0：未知、1：男、2：女
    phone: { type: String },

    status: { type: Number, default: 1, alias: 'online' },

    groups: [{ type: String, ref: 'Group' }], // 

    email: String,


    sex: String, // 'male'
    role: String,  // 'member'
    title: String, // 
    level: Number, //
    groupNickName: String, // 群内昵称
    subType: String,  // 关系：好友/家人。。。

    messages: [{
      messageId: { type: String, ref: 'message' },
      rawMessage: String,
      time: Date,
      receiveId: String,
      groupId: String
    }],  // {time,rawMessage}
    friend: [],
    createdAt: { type: Date, select: false },
    updatedAt: { type: Date, select: false },
  },
  { timestamps: true }
)

userSchema.pre('save', function (next) {
  const self = this
  if (this.isNew)
    Sequence.increment('User', function (err, doc) {
      if (err) throw err
      self.no = doc.next
      next()
    })
  else next()
})


userSchema.statics = {
  updateInfo(data) {
    const { _id, messages, groupId, sex, friend } = data
    const [message] = messages
    const [id] = friend
    this.findByIdAndUpdate(_id, { $push: { messages: message }, $addToSet: groupId ? { groups: groupId, friend: id } : { friend: id } }, (err, res) => {
      if (res) return
      data.gender = sex === 'male' ? 1 : sex === 'female' ? 2 : 0
      this.create(data)
    })
  },

}

userSchema.set('toObject', { getters: true, virtuals: true })
userSchema.set('toJSON', { getters: true, virtuals: true })

module.exports = model('User', userSchema)


/* userSchema.virtual('auths', {
  ref: 'Group', // The model to use
  localField: 'group_id', // Find people where `localField`
  foreignField: '_id', // is equal to `foreignField`
  // If `justOne` is true, 'members' will be a single doc as opposed to
  // an array. `justOne` is false by default.
  justOne: true
}) */