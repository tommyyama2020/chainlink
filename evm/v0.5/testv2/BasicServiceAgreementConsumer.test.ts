import * as h from '../src/helpers'
// import { assertBigNum } from '../src/matchers'
import { makeTestProvider } from '../src/provider'
import {
  CoordinatorFactory,
  MeanAggregatorFactory,
  ServiceAgreementConsumerFactory,
  LinkTokenFactory,
} from '../src/generated'
import { Instance } from '../src/contract'
import { ethers } from 'ethers'
import { assert } from 'chai'

const coordinatorFactory = new CoordinatorFactory()
const meanAggregatorFactory = new MeanAggregatorFactory()
const serviceAgreementConsumerFactory = new ServiceAgreementConsumerFactory()
const linkTokenFactory = new LinkTokenFactory()

// create ethers provider from that web3js instance
const provider = makeTestProvider()

let roles: h.Roles

beforeAll(async () => {
  const rolesAndPersonas = await h.initializeRolesAndPersonas(provider)

  roles = rolesAndPersonas.roles
})

describe('ServiceAgreementConsumer', () => {
  // const currency = h.toHex('USD')
  let link: Instance<LinkTokenFactory>
  let coord: Instance<CoordinatorFactory>
  let cc: Instance<ServiceAgreementConsumerFactory>
  let agreement: h.ServiceAgreement

  beforeEach(async () => {
    const meanAggregator = await meanAggregatorFactory
      .connect(roles.defaultAccount)
      .deploy()

    agreement = {
      oracles: [roles.oracleNode.address],
      aggregator: meanAggregator.address,
      aggInitiateJobSelector:
        meanAggregator.interface.functions.initiateJob.sighash,
      aggFulfillSelector: meanAggregator.interface.functions.fulfill.sighash,
      endAt: h.sixMonthsFromNow(),
      expiration: ethers.utils.bigNumberify(300),
      payment: ethers.utils.bigNumberify('1000000000000000000'),
      requestDigest:
        '0xbadc0de5badc0de5badc0de5badc0de5badc0de5badc0de5badc0de5badc0de5',
    }
    const oracleSignatures = await h.computeOracleSignature(
      agreement,
      roles.oracleNode,
    )

    link = await linkTokenFactory.connect(roles.defaultAccount).deploy()
    coord = await coordinatorFactory
      .connect(roles.defaultAccount)
      .deploy(link.address)

    await coord.initiateServiceAgreement(
      h.encodeServiceAgreement(agreement),
      h.encodeOracleSignatures(oracleSignatures),
    )
    cc = await serviceAgreementConsumerFactory
      .connect(roles.defaultAccount)
      .deploy(link.address, coord.address, h.generateSAID(agreement))
  })

  it.only('gas price of contract deployment is predictable', async () => {
    const rec = await provider.getTransactionReceipt(
      cc.deployTransaction.hash ?? '',
    )
    assert.isBelow(rec.gasUsed?.toNumber() ?? 0, 1500000)
  })
})
//   describe('#requestEthereumPrice', () => {
//     describe('without LINK', () => {
//       it('reverts', async () => {
//         await h.assertActionThrows(async () => {
//           await cc.requestEthereumPrice(currency)
//         })
//       })
//     })

//     describe('with LINK', () => {
//       const paymentAmount = h.toWei('1', 'h.ether')
//       beforeEach(async () => {
//         await link.transfer(cc.address, paymentAmount)
//       })

//       it('triggers a log event in the Coordinator contract', async () => {
//         const tx = await cc.requestEthereumPrice(currency)
//         const log = tx.receipt.rawLogs[3]
//         assert.equal(log.address.toLowerCase(), coord.address.toLowerCase())

//         const request = h.decodeRunRequest(log)
//         const params = await h.decodeDietCBOR(request.data)
//         assert.equal(agreement.id, request.jobId)
//         assertBigNum(paymentAmount, h.bigNum(request.payment))
//         assert.equal(cc.address.toLowerCase(), request.requester.toLowerCase())
//         assertBigNum(1, request.dataVersion)
//         const url =
//           'https://min-api.cryptocompare.com/data/price?fsym=ETH&tsyms=USD,EUR,JPY'
//         assert.deepEqual(params, { path: currency, get: url })
//       })

//       it('has a reasonable gas cost', async () => {
//         const tx = await cc.requestEthereumPrice(currency)
//         assert.isBelow(tx.receipt.gasUsed, 175000)
//       })
//     })
//   })

//   describe('#fulfillOracleRequest', () => {
//     const response = h.toHex('1,000,000.00')
//     let request

//     beforeEach(async () => {
//       await link.transfer(cc.address, h.toWei(1, 'ether'))
//       const tx = await cc.requestEthereumPrice(currency)
//       request = h.decodeRunRequest(tx.receipt.rawLogs[3])
//     })

//     it('records the data given to it by the oracle', async () => {
//       await coord.fulfillOracleRequest(request.id, response, {
//         from: h.oracleNode,
//       })
//       const currentPrice = await cc.currentPrice.call()
//       assert.equal(h.toUtf8(currentPrice), h.toUtf8(response))
//     })

//     describe('when the consumer does not recognize the request ID', () => {
//       let request2

//       beforeEach(async () => {
//         const funcSig = h.functionSelector('fulfill(bytes32,bytes32)')
//         const args = h.executeServiceAgreementBytes(
//           agreement.id,
//           cc.address,
//           funcSig,
//           1,
//           '',
//         )
//         const tx = await h.requestDataFrom(coord, link, agreement.payment, args)
//         request2 = h.decodeRunRequest(tx.receipt.rawLogs[2])
//       })

//       it('does not accept the data provided', async () => {
//         await coord.fulfillOracleRequest(request2.id, response, {
//           from: h.oracleNode,
//         })

//         const received = await cc.currentPrice.call()
//         assert.equal(h.toUtf8(received), '')
//       })
//     })

//     describe('when called by anyone other than the oracle contract', () => {
//       it('does not accept the data provided', async () => {
//         await h.assertActionThrows(async () => {
//           await cc.fulfill(request.id, response, { from: h.oracleNode })
//         })
//         const received = await cc.currentPrice.call()
//         assert.equal(h.toUtf8(received), '')
//       })
//     })
//   })
// })
