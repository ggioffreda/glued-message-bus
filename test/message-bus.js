const assert = require('assert')
const sinon = require('sinon')
const initialiser = require('./message-bus-context')

const describe = require('mocha').describe
const it = require('mocha').it
const before = require('mocha').before

describe('MessageBusErrors', function () {
  var context = initialiser.initialiseContext()

  describe('#connectionError', function () {
    it('connection error code is 1', function () {
      assert.equal(1, context.mb.MessageBusErrors.connectionError)
    })
  })

  describe('#channelError', function () {
    it('channel error code is 2', function () {
      assert.equal(2, context.mb.MessageBusErrors.channelError)
    })
  })
})

describe('MessageBus', function () {
  var context = null

  before(function () {
    context = initialiser.initialiseContext()
  })

  describe('#getServer(), #getExchange(), #getConnection()', function () {
    it('should return the server URL', function () {
      assert.equal(context.server, context.messageBus.getServer())
    })

    it('should return the exchange', function () {
      assert.equal(context.exchange, context.messageBus.getExchange())
    })

    it('should be null until a connection is established', function () {
      assert.equal(null, context.messageBus.getConnection())
    })
  })

  describe('#connectModule()', function () {
    var channel = null

    before(function (done) {
      context = initialiser.initialiseContext()
      context.messageBus.connectModule(function (err, result) {
        if (err) done(err)
        channel = result
        done()
      })
    })

    describe('when successful', function () {
      it('should open a connection for the module', function () {
        assert(context.amqp.connect.called)
        assert.equal(context.amqpConnection, context.messageBus.getConnection())
      })

      it('should open a channel for the module', function () {
        assert(context.amqpConnection.createChannel.calledOnce)
        assert.equal(context.amqpChannel, channel.getChannel())
      })

      it('should initialise a durable exchange as "topic"', function () {
        assert(context.amqpChannel.assertExchange.calledOnce)
        assert.equal('topic', context.amqpChannel.assertExchange.args[0][1])
        assert(context.amqpChannel.assertExchange.lastCall.args[2].durable)
      })
    })

    describe('when failing because the setup of the exchange fails', function () {
      var error = null
      var channel = null

      before(function (done) {
        context = initialiser.initialiseContext(false, false, true)
        context.messageBus.connectModule(function (err, result) {
          error = err
          channel = result
          done()
        })
      })

      it('should open a connection for the module', function () {
        assert(context.amqp.connect.calledOnce)
        assert.equal(context.amqpConnection, context.messageBus.getConnection())
      })

      it('should try and open a channel for the module', function () {
        assert(context.amqpConnection.createChannel.calledOnce)
      })

      it('should not be able to initialise a durable exchange as "topic"', function () {
        assert(context.amqpChannel.assertExchange.calledOnce)
        assert.equal('topic', context.amqpChannel.assertExchange.args[0][1])
        assert(context.amqpChannel.assertExchange.args[0][2].durable)
        assert(channel === null)
        assert(error !== null)
      })
    })

    describe('when failing because the setup of the channel fails', function () {
      var error = null
      var channel = null

      before(function (done) {
        context = initialiser.initialiseContext(false, true)
        context.messageBus.connectModule(function (err, result) {
          error = err
          channel = result
          done()
        })
      })

      it('should open a connection for the module', function () {
        assert(context.amqp.connect.calledOnce)
        assert.equal(context.amqpConnection, context.messageBus.getConnection())
      })

      it('should unsuccessfully try and open a channel for the module', function () {
        assert(context.amqpConnection.createChannel.calledOnce)
        assert.equal(null, channel)
        assert.notEqual(null, error)
        assert(error.message.match(/Fake error$/))
      })

      it('should not try and initialise a durable exchange', function () {
        assert(context.amqpChannel.assertExchange.notCalled)
      })
    })

    describe('when failing because the connection fails', function () {
      var error = null
      var channel = null

      before(function (done) {
        context = initialiser.initialiseContext(true)
        context.messageBus.connectModule(function (err, result) {
          error = err
          channel = result
          done()
        })
      })

      it('should open a connection for the module', function () {
        assert(context.amqp.connect.calledOnce)
        assert.equal(null, context.messageBus.getConnection())
        assert(channel === null)
        assert(error !== null)
      })

      it('should not try and open a channel for the module', function () {
        assert(context.amqpConnection.createChannel.notCalled)
      })

      it('should not try and initialise a durable exchange', function () {
        assert(context.amqpChannel.assertExchange.notCalled)
      })
    })
  })
})

describe('MessageBusChannel', function () {
  var context = null
  var channel = null

  before(function (done) {
    context = initialiser.initialiseContext()
    context.messageBus.connectModule(function (err, ch) {
      if (err) return done(err)
      channel = ch
      done()
    })
  })

  describe('#getMessageBus(), #getChannel()', function () {
    it('should return the message bus', function () {
      assert.equal(context.messageBus, channel.getMessageBus())
    })

    it('should return the channel', function () {
      assert.equal(context.amqpChannel, channel.getChannel())
    })
  })

  describe('#getRpc()', function () {
    it('should return a message bus RPC object', function () {
      assert.ok(channel.getRpc())
      assert.ok(channel.getRpc().request)
      assert.ok(channel.getRpc().accept)
    })

    it('should always return the very same object', function () {
      const got = channel.getRpc()
      assert.strictEqual(channel.getRpc(), got)
    })
  })

  describe('#publish()', function () {
    const key = 'test.key'
    const message = 'test message'

    before(function () {
      channel.publish(key, message)
    })

    it('should publish the message on the channel', function () {
      assert(context.amqpChannel.publish.calledOnce)
      assert.equal(4, context.amqpChannel.publish.args[0].length)
    })

    it('should publish to the correct exchange', function () {
      assert.equal(context.exchange, context.amqpChannel.publish.args[0][0])
    })

    it('should publish with the given key', function () {
      assert.equal(key, context.amqpChannel.publish.args[0][1])
    })

    it('should publish the given message', function () {
      assert.equal(context.amqpChannel.publish.args[0][2].toString(), JSON.stringify(message))
    })

    it('should publish persistent messages', function () {
      assert(context.amqpChannel.publish.args[0][3].persistent)
    })

    it('should publish as JSON', function () {
      assert.equal('application/json', context.amqpChannel.publish.args[0][3].content_type)
    })
  })
})

describe('MessageBusRpc', function () {
  var context = null
  var channel = null
  var rpc = null
  const queue = 'test_rpc'

  describe('#accept()', function () {
    var consumer = null

    before(function (done) {
      context = initialiser.initialiseContext()
      context.messageBus.connectModule(function (err, ch) {
        if (err) return done(err)
        channel = ch
        rpc = channel.getRpc()
        consumer = sinon.stub()
        consumer.callsArgWith(2, 'yo')
        rpc.accept(queue, consumer)
        done()
      })
    })

    it('should set up the non durable queue', function () {
      assert.equal(context.amqpChannel.assertQueue.lastCall.args[0], queue)
      assert.equal(context.amqpChannel.assertQueue.lastCall.args[1].durable, false)
    })

    it('should set up prefetch to 1', function () {
      assert.equal(context.amqpChannel.prefetch.lastCall.args[0], 1)
    })

    it('should set up to consume the queue', function () {
      assert.equal(context.amqpChannel.consume.lastCall.args[0], queue)
    })

    it('should ack the message if replyTo or correlationId are missing without calling the consumer', function () {
      rpc._callConsumer(context.amqpChannel, consumer, { properties: {} })
      rpc._callConsumer(context.amqpChannel, consumer, { properties: { replyTo: 'x' } })
      rpc._callConsumer(context.amqpChannel, consumer, { properties: { correlationId: 'y' } })
      assert.ok(!consumer.called)
      assert.ok(context.amqpChannel.ack.calledThrice)
    })

    it('should call the consumer if replyTo and correlationId are present', function () {
      rpc._callConsumer(context.amqpChannel, consumer, {
        properties: { replyTo: 'x', correlationId: 'y' },
        content: '"z"'
      })
      assert.ok(consumer.calledOnce)
      assert.equal(context.amqpChannel.ack.callCount, 4)
      assert.equal(consumer.lastCall.args[0], 'z')
      assert.ok(context.amqpChannel.sendToQueue.calledOnce)
    })
  })

  describe('#request()', function () {
    var handler = sinon.stub()

    before(function (done) {
      context = initialiser.initialiseContext()
      context.amqpChannel.assertQueue.callsArgWith(2, null, { queue: 'xyz' })
      context.messageBus.connectModule(function (err, ch) {
        if (err) return done(err)
        channel = ch
        rpc = channel.getRpc()
        done()
      })
    })

    it('should create a new private channel', function () {
      rpc.request(queue, 'test', handler)
      assert.ok(context.amqpChannel.assertQueue.calledOnce)
      assert.equal(context.amqpChannel.assertQueue.lastCall.args[0], '')
      assert.deepEqual(context.amqpChannel.assertQueue.lastCall.args[1], { exclusive: true, durable: false })
    })

    it('and use the same private channel for subsequent calls', function () {
      var privateQueue = rpc.getPrivateQueue()
      rpc.request(queue, 'second test', handler)
      assert.strictEqual(rpc.getPrivateQueue(), privateQueue)
    })

    it('should set up a consumer for the responses', function () {
      rpc.request(queue, 'third test', handler)
      assert.equal(context.amqpChannel.consume.lastCall.args[0], rpc.getPrivateQueue().queue)
      assert.deepEqual(context.amqpChannel.consume.lastCall.args[2], { noAck: true })
    })

    it('should send the message to the queue', function () {
      rpc.request(queue, 'fourth test', handler)
      assert.equal(context.amqpChannel.sendToQueue.lastCall.args[0], queue)
      assert.equal(context.amqpChannel.sendToQueue.lastCall.args[1].toString(), '"fourth test"')
    })

    it('should send the reply to the private channel', function () {
      var trackers = rpc._getTrackers()
      var correlationId = Object.keys(trackers).pop()
      rpc._replyConsumer({ content: '"Test content"', properties: { correlationId: correlationId } })
      assert.ok(handler.calledOnce)
      assert.equal(handler.lastCall.args[0], null)
      assert.equal(handler.lastCall.args[1], 'Test content')
    })
  })
})
