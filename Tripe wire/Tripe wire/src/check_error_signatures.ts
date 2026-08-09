import { toFunctionSelector } from 'viem';

const errors = [
  'FeeRecipientCannotBeZeroAddress()',
  'FeeRecipientRestricted()',
  'FeeRecipientNotAllowed()',
  'FeeRecipientNotPresent()',
  'InvalidFeeRecipient()',
  'CreatorFeeRecipientNotAllowed()',
  'FeeRecipientNotAllowedForNFTContract()',
  'FeeRecipientNotAllowed(address)',
  'FeeRecipientNotAllowed(address,address)',
  'FeeRecipientNotAllowed(address nftContract, address feeRecipient)',
  'FeeRecipientCannotBeZeroAddress(address nftContract)',
  'FeeRecipientRestricted(address nftContract)',
  'FeeRecipientNotAllowed(address)',
  'FeeRecipientNotAllowed()',
  'FeeRecipientIsZeroAddress()',
  'FeeRecipientZeroAddress()',
  'ZeroAddressFeeRecipient()',
  'RestrictedFeeRecipient()',
  'RestrictedFeeRecipient(address)',
  'FeeRecipientRequired()',
  'FeeRecipientRequired(address)',
];

const target = '0x5136e8d5';
console.log(`Checking matching error for target: ${target}`);

for (const err of errors) {
  try {
    const sel = toFunctionSelector(`error ${err}`);
    if (sel === target) {
      console.log(`🎉 EXACT MATCH FOUND! ${sel} -> error ${err}`);
    }
  } catch {}
}
