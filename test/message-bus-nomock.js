const assert = require('assert')
const mocha = require('mocha')
const describe = mocha.describe
const it = mocha.it
const before = mocha.before

const MessageBus = require('../index').MessageBus
const MessageBusChannel = require('../index').MessageBusChannel
const serverOk = 'amqp://localhost'
const serverKo = 'amqp://localhost:11111'
const messageBusName = 'glued_message_bus_test'

describe('Functional Test - No Mocks', function () {
  var skip = false
  const ifNotSkipped = function (should, tests) {
    it(should, function (done) {
      if (skip) {
        this.skip()
        return
      }

      this.slow(500)
      tests.apply(this, [done])
    })
  }

  before(function (done) {
    const messageBus = new MessageBus(serverOk, messageBusName)
    messageBus.connectModule(function (err) {
      if (err) {
        skip = true
      }
      done()
    })
  })

  describe('MessageBus', function () {
    ifNotSkipped('should connect a module', function (done) {
      const messageBus = new MessageBus(serverOk, messageBusName)
      messageBus.connectModule(function (err, channel) {
        assert.ok(err === null)
        assert.ok(channel instanceof MessageBusChannel)
        done()
      })
    })

    ifNotSkipped('should error if it cannot connect', function (done) {
      const messageBus = new MessageBus(serverKo, messageBusName)
      messageBus.connectModule(function (err, channel) {
        assert.ok(channel === null)
        assert.ok(err !== null)
        done()
      })
    })
  })

  describe('MessageBusChannel', function () {
    var channel = null
    const testTopic = 'test.topic'
    const testMessage = {content: 'testContent'}
    const testQueue = 'test_queue'
    const consumer = function (topic, done, raw, sentRaw) {
      return function (routingKey, message, rawMessage, callback) {
        assert.equal(routingKey, topic)
        if (raw) {
          if (sentRaw) {
            assert.equal(message.toString(), sentRaw.toString())
          } else {
            assert.equal(message.toString(), rawMessage.content.toString())
          }
        } else {
          assert.deepEqual(message, testMessage)
          assert.deepEqual(JSON.parse(rawMessage.content.toString()), testMessage)
        }
        callback()
        done()
      }
    }

    before(function (done) {
      if (skip) {
        done()
        return
      }

      const messageBus = new MessageBus(serverOk, messageBusName)
      messageBus.connectModule(function (err, ch) {
        if (err) throw err
        channel = ch
        done()
      })
    })

    ifNotSkipped('should subscribe to a channel on a generated queue and receive messages through it', function (done) {
      assert.ok(channel instanceof MessageBusChannel)
      channel.subscribe(testTopic + '.generated', consumer(testTopic + '.generated', done))
      setTimeout(function () {
        channel.publish(testTopic + '.generated', testMessage)
      }, 100)
    })

    ifNotSkipped('should subscribe to a channel on a given queue and receive messages through it', function (done) {
      assert.ok(channel instanceof MessageBusChannel)
      channel.subscribe(testTopic + '.given', consumer(testTopic + '.given', done), testQueue)
      setTimeout(function () {
        channel.publish(testTopic + '.given', testMessage)
      }, 100)
    })

    ifNotSkipped('should subscribe to a channel for raw messages and receive them raw', function (done) {
      assert.ok(channel instanceof MessageBusChannel)
      channel.subscribe(testTopic + '.raw', consumer(testTopic + '.raw', done, true), '', true)
      setTimeout(function () {
        channel.publish(testTopic + '.raw', testMessage)
      }, 100)
    })

    ifNotSkipped('should subscribe to a channel for raw messages and receive them raw (sent raw)', function (done) {
      const sentRaw = new Buffer('No json here')
      assert.ok(channel instanceof MessageBusChannel)
      channel.subscribe(testTopic + '.sent-raw', consumer(testTopic + '.sent-raw', done, true, sentRaw), '', true)
      setTimeout(function () {
        channel.publish(testTopic + '.sent-raw', sentRaw, true)
      }, 100)
    })
  })

  describe('MessageBusRpc', function () {
    var rpc = null
    const queue = 'test_rpc'
    const consumer = function (message, rawMessage, replier) {
      replier(message + 'REPLY')
    }

    before(function (done) {
      if (skip) {
        done()
        return
      }

      const messageBus = new MessageBus(serverOk, messageBusName)
      messageBus.connectModule(function (err, ch) {
        if (err) throw err
        rpc = ch.getRpc()
        done()
      })
    })

    ifNotSkipped('should reply to a request with a response', function (done) {
      rpc.accept(queue, consumer)
      setTimeout(function () {
        rpc.request(queue, 'Sup?', function (err, reply, rawReply) {
          assert.ok(err === null)
          assert.equal(reply, 'Sup?REPLY')
          assert.equal(JSON.stringify(reply), rawReply.content.toString())
          done()
        })
      }, 100)
    })
  })
})
