import { useState, useEffect } from 'preact/hooks';
import {
  deriveUserKey,
  deriveClientSeedHash,
  commitEpoch,
  verifyEpoch,
  resolveOpen,
} from '@riprip-io/provably-fair';
import { bytesToHex, parseHex } from '../lib/hex';
import { buildMessageV2, resolveOpenBatchV2, verifyBeaconBLS } from '../lib/openv2';

type Status = 'running' | 'pass' | 'fail';

export function SelfTestBanner() {
  const [status, setStatus] = useState<Status>('running');
  const [failReason, setFailReason] = useState('');

  useEffect(() => {
    try {
      // Golden test vectors (from OPENv1 reference)
      const serverSecret = new Uint8Array(32).fill(0x01);
      const userId = '550e8400-e29b-41d4-a716-446655440000';
      const clientSeed = 'my-client-seed';
      const epochId = 20260210;
      const purchaseNonce = 42n;
      const packConfigHash = new Uint8Array(32).fill(0xbb);
      const drawTables = [
        {
          drawId: 0,
          drawsPerOpen: 3,
          items: [
            { sku: 'COMMON', weight: 700 },
            { sku: 'UNCOMMON', weight: 200 },
            { sku: 'RARE', weight: 100 },
          ],
        },
      ];

      // 1. deriveUserKey
      const userKey = deriveUserKey(userId);
      assert(
        bytesToHex(userKey) === '667949508eea84730f4bdb93f470c0ae37964b8d0e8a29775e5d77d81bec4e06',
        'deriveUserKey mismatch',
      );

      // 2. deriveClientSeedHash
      const csh = deriveClientSeedHash(clientSeed);
      assert(
        bytesToHex(csh) === '6a5ab24eb2b06bf8c45078e754eb80b0a5705db46875a379fe3e454bcd9d171c',
        'deriveClientSeedHash mismatch',
      );

      // 3. commitEpoch
      const commitHash = commitEpoch(serverSecret);
      assert(
        bytesToHex(commitHash) === '72cd6e8422c407fb6d098690f1130b7ded7ec2f7f5e1d30bd9d521f015363793',
        'commitEpoch mismatch',
      );

      // 4. verifyEpoch
      assert(verifyEpoch(serverSecret, commitHash), 'verifyEpoch should return true');
      assert(!verifyEpoch(new Uint8Array(32).fill(0x02), commitHash), 'verifyEpoch should return false for wrong secret');

      // 5. resolveOpen — full end-to-end
      const result = resolveOpen(
        serverSecret,
        epochId,
        userKey,
        purchaseNonce,
        packConfigHash,
        0,
        csh,
        drawTables,
      );

      assert(result.draws.length === 3, 'expected 3 draws');
      assert(result.draws[0].ticket === 24966, 'draw 0 ticket mismatch');
      assert(result.draws[0].selectedItem === 'UNCOMMON', 'draw 0 selection mismatch');
      assert(result.draws[1].ticket === 586394, 'draw 1 ticket mismatch');
      assert(result.draws[1].selectedItem === 'COMMON', 'draw 1 selection mismatch');
      assert(result.draws[2].ticket === 437127, 'draw 2 ticket mismatch');
      assert(result.draws[2].selectedItem === 'COMMON', 'draw 2 selection mismatch');

      // 6. OPENv2 (RIP-996) — frozen vectors pinned to REAL quicknet round
      //    1000 (independently fetchable from any drand relay).
      const drandRound = 1000;
      const drandRandomness = parseHex(
        'fe290beca10872ef2fb164d2aa4442de4566183ec51c56ff3cd603d930e54fdd',
      );
      const drandSignature = parseHex(
        'b44679b9a59af2ec876b1a6b1ad52ea9b1615fc3982b19576350f93447cb1125e342b73a8dd2bacbe47e4b6b63ed5e39',
      );

      const msgV2 = buildMessageV2(
        { epochId, userKey, purchaseNonce, packConfigHash, openIndex: 0, drawIndex: 0, clientSeedHash: csh },
        { drandRound, drandRandomness },
      );
      assert(msgV2.length === 162, 'OPENv2 message length mismatch');
      assert(
        bytesToHex(msgV2.slice(0, 6)) === '4f50454e7632', // "OPENv2"
        'OPENv2 tag mismatch',
      );

      const v2 = resolveOpenBatchV2(
        serverSecret,
        epochId,
        userKey,
        purchaseNonce,
        packConfigHash,
        csh,
        { drandRound, drandRandomness },
        1,
        drawTables,
      );
      const v2draws = v2.results[0].draws;
      assert(v2draws[0].ticket === 499169 && v2draws[0].selectedItem === 'COMMON', 'v2 draw 0 mismatch');
      assert(v2draws[1].ticket === 811907 && v2draws[1].selectedItem === 'COMMON', 'v2 draw 1 mismatch');
      assert(v2draws[2].ticket === 555714 && v2draws[2].selectedItem === 'COMMON', 'v2 draw 2 mismatch');

      // 7. BLS: the real round-1000 signature must verify against the
      //    quicknet group key; a tampered one must not.
      assert(verifyBeaconBLS(drandRound, drandSignature), 'BLS verify should pass for real beacon');
      const tampered = parseHex(bytesToHex(drandSignature));
      tampered[5] ^= 1;
      assert(!verifyBeaconBLS(drandRound, tampered), 'BLS verify should fail for tampered beacon');

      setStatus('pass');
    } catch (e) {
      setStatus('fail');
      setFailReason(e instanceof Error ? e.message : 'Unknown error');
    }
  }, []);

  if (status === 'running') {
    return (
      <div class="mb-6 p-3 bg-gray-900 border border-gray-700 rounded text-sm text-gray-400">
        Running self-test...
      </div>
    );
  }

  if (status === 'fail') {
    return (
      <div class="mb-6 p-3 bg-red-900/40 border border-red-700 rounded text-sm text-red-300">
        <strong>Library self-test: FAIL</strong> — DO NOT USE this verifier. {failReason}
      </div>
    );
  }

  return (
    <div class="mb-6 p-3 bg-emerald-900/30 border border-emerald-800 rounded text-sm text-emerald-400">
      Library self-test: PASS
    </div>
  );
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
