/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import "chai-bn";

import { chaiSolana, expectTX } from "@saberhq/chai-solana";
import type { PublicKey } from "@saberhq/solana-contrib";
import { TransactionEnvelope } from "@saberhq/solana-contrib";
import {
  createInitMintInstructions,
  createMintToInstruction,
  getMintInfo,
  getOrCreateATA,
  u64,
} from "@saberhq/token-utils";
import { Keypair } from "@solana/web3.js";
import { BN } from "bn.js";
import chai, { assert, expect } from "chai";

import type { WeightedToken } from "../../src";
import { enumLikeToString } from "../../src";
import { coherenceHelper } from "../helper";

chai.use(chaiSolana);

before("Intialize Unit Helper", () => {
  let prismEtfMint: PublicKey;
  let tokenAATA: PublicKey;
  let tokenBATA: PublicKey;
  let tokenBMint: PublicKey;
  let transferredTokensAcct: PublicKey;
  let weightedTokens: WeightedToken[];

  const decimalsA = 6;
  const decimalsB = 11;
  const tokenAWeight = new BN(3246753);
  const tokenBWeight = new BN(7);

  /*
  1. Setup 2 Token Mints
  2. Create PrismETF
  3. Mint 100 of each token to testSigner.publicKey
  */
  it("Building sample PrismETF for unitHelper", async () => {
    const [initPrismEtFTx, _prismEtfMint, weightedTokensAcct] =
      await coherenceHelper.sdk.initPrismEtf({
        beamsplitter: coherenceHelper.beamsplitter,
      });

    prismEtfMint = _prismEtfMint;

    await expectTX(initPrismEtFTx, "Initialize asset with assetToken").to.be
      .fulfilled;

    const mintInfo = await getMintInfo(coherenceHelper.provider, prismEtfMint);
    assert(mintInfo.mintAuthority?.equals(coherenceHelper.beamsplitter));

    let prismEtf = await coherenceHelper.sdk.fetchPrismEtfDataFromSeeds({
      beamsplitter: coherenceHelper.beamsplitter,
      prismEtfMint,
    });

    if (!prismEtf) {
      assert.fail("Prism Etf was not successfully created");
    }

    assert(prismEtf.manager.equals(coherenceHelper.authority));
    expect(enumLikeToString(prismEtf.status)).to.be.equal("unfinished");

    const tokenAKP = Keypair.generate();
    const tokenAMintTx = await createInitMintInstructions({
      provider: coherenceHelper.provider,
      mintKP: tokenAKP,
      decimals: decimalsA,
      mintAuthority: coherenceHelper.authority,
    });

    await expectTX(tokenAMintTx).to.be.fulfilled;

    const tokenBKP = Keypair.generate();
    const tokenBMintTx = await createInitMintInstructions({
      provider: coherenceHelper.provider,
      mintKP: tokenBKP,
      decimals: decimalsB,
      mintAuthority: coherenceHelper.authority,
    });

    tokenBMint = tokenBKP.publicKey;

    await expectTX(tokenBMintTx).to.be.fulfilled;

    weightedTokens = [
      {
        mint: tokenAKP.publicKey,
        weight: tokenAWeight,
      },
      {
        mint: tokenBKP.publicKey,
        weight: tokenBWeight,
      },
    ];
    const pushTokensEnvelopes = await coherenceHelper.sdk.pushTokens({
      beamsplitter: coherenceHelper.beamsplitter,
      prismEtfMint,
      weightedTokens,
      weightedTokensAcct,
    });

    // Have to do pushing in seq (Promise.all is not an option)
    for (const pushTokensEnvelope of pushTokensEnvelopes) {
      await expectTX(pushTokensEnvelope).to.be.fulfilled;
    }

    const weightedTokenData = await coherenceHelper.sdk.fetchWeightedTokens(
      prismEtf.weightedTokens
    );

    expect(weightedTokenData?.length).to.be.equal(2);

    const finalizePrismEtfTx = await coherenceHelper.sdk.finalizePrismEtf({
      beamsplitter: coherenceHelper.beamsplitter,
      prismEtfMint,
    });

    await expectTX(finalizePrismEtfTx, "Finalize PrismEtf").to.be.fulfilled;

    prismEtf = await coherenceHelper.sdk.fetchPrismEtfDataFromSeeds({
      beamsplitter: coherenceHelper.beamsplitter,
      prismEtfMint,
    });

    if (!prismEtf) {
      assert.fail("Prism Etf was not successfully created");
    }

    expect(enumLikeToString(prismEtf.status)).to.be.equal("finished");

    const { address: _tokenAATA, instruction: createAATA } =
      await getOrCreateATA({
        provider: coherenceHelper.provider,
        mint: tokenAKP.publicKey,
        owner: coherenceHelper.authority,
      });

    tokenAATA = _tokenAATA;
    if (createAATA) {
      await expectTX(
        new TransactionEnvelope(coherenceHelper.provider, [createAATA])
      ).to.be.fulfilled;
    }

    const tokenAToTx = createMintToInstruction({
      provider: coherenceHelper.provider,
      mint: tokenAKP.publicKey,
      mintAuthorityKP: coherenceHelper.testSigner,
      to: tokenAATA,
      amount: new u64(100 * 10 ** 9),
    });

    await expectTX(tokenAToTx).to.be.fulfilled;

    const { address: _tokenBATA, instruction: createBATA } =
      await getOrCreateATA({
        provider: coherenceHelper.provider,
        mint: tokenBKP.publicKey,
        owner: coherenceHelper.authority,
      });

    tokenBATA = _tokenBATA;
    if (createBATA) {
      await expectTX(
        new TransactionEnvelope(coherenceHelper.provider, [createBATA])
      ).to.be.fulfilled;
    }

    const tokenBToTx = createMintToInstruction({
      provider: coherenceHelper.provider,
      mint: tokenBKP.publicKey,
      mintAuthorityKP: coherenceHelper.testSigner,
      to: tokenBATA,
      amount: new u64(100 * 10 ** 9),
    });

    await expectTX(tokenBToTx).to.be.fulfilled;
  });
});

// Create's PrismETF using coherencehelper's beamsplitter program
export const createPrismEtfUsingHelper = async (
  weightedTokens: WeightedToken[]
) => {
  await coherenceHelper.sdk.createPrismEtf({
    beamsplitter: coherenceHelper.beamsplitter,
    weightedTokens,
  });
};
