function initialiseContext (failedConnection, failedChannel, failedChannelMethod) {
  const sinon = require('sinon')
  const mb = require('../index')
  const server = 'amqp://localhost'
  const exchange = 'test_bus'
  const defaultError = new Error('Fake error')
  const amqpChannel = {
    assertExchange: sinon.stub().returns(new Promise(function (resolve, reject) {
      if (failedChannelMethod) reject(defaultError)
      else resolve({})
    })),
    assertQueue: sinon.stub(),
    prefetch: sinon.stub(),
    publish: sinon.stub(),
    bindQueue: sinon.stub(),
    sendToQueue: sinon.stub(),
    consume: sinon.stub(),
    ack: sinon.stub()
  }
  const amqpConnection = {
    createChannel: sinon.stub().returns(new Promise(function (resolve, reject) {
      if (failedChannel) reject(defaultError)
      else resolve(amqpChannel)
    }))
  }
  const amqp = {
    connect: sinon.stub().returns(new Promise(function (resolve, reject) {
      if (failedConnection) reject(defaultError)
      else resolve(amqpConnection)
    }))
  }

  return {
    mb: mb,
    server: server,
    exchange: exchange,
    defaultError: defaultError,
    amqpChannel: amqpChannel,
    amqpConnection: amqpConnection,
    amqp: amqp,
    messageBus: new mb.MessageBus(server, exchange, amqp)
  }
}

exports.initialiseContext = initialiseContext

