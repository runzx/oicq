/**
 * 存储ID的序列值
 * 翟享20181121
 * 20190707
 */
const mongoose = require('mongoose')

const { Schema, model } = mongoose
const { Mixed, ObjectId, Decimal128 } = Schema.Types

const SequenceSchema = new Schema({
  _id: String,
  bisId: { type: ObjectId },
  next: Number,
  name: String // 用来取代_id, 因为其不能重复
})

SequenceSchema.statics.increment = function (schemaName, callback) {
  return this.findOneAndUpdate(
    { _id: schemaName },
    { $inc: { next: 1 } },
    { new: true, upsert: true },
    callback
  )
}
// 此为能重复设置相应的集合，以 bisId 区分各自的自增id
SequenceSchema.statics.inc = function (
  schemaName,
  bisId = '5b812ab8262ca755c438c7a3',
  callback
) {
  return this.findOneAndUpdate(
    { name: schemaName, bisId },
    { $inc: { next: 1 } },
    { new: true, upsert: true },
    callback
  )
}

module.exports = model('Sequence', SequenceSchema)
