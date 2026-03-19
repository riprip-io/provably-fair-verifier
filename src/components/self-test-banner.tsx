import { useState, useEffect } from 'preact/hooks';
import {
  deriveUserKey,
  deriveClientSeedHash,
  commitEpoch,
  verifyEpoch,
  resolveOpen,
} from '@riprip-io/provably-fair';
import { bytesToHex } from '../lib/hex';

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
