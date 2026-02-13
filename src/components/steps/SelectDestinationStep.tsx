"use client";

import type { RefObject } from "react";
import { Check, ChevronDown } from "lucide-react";
import type { StepStatus } from "../../types";
import { shortAddr, isValidAddress } from "../../utils";
import { CHAIN_META, DEST_CHAINS } from "../../constants";
import { StepCard } from "../StepCard";

interface Props {
  status: StepStatus;
  destChainId: number;
  setDestChainId: (id: number) => void;
  destConfirmed: boolean;
  setDestConfirmed: (v: boolean) => void;
  chainDropdownOpen: boolean;
  setChainDropdownOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  chainDropdownRef: RefObject<HTMLDivElement | null>;
  chainTriggerRef: RefObject<HTMLButtonElement | null>;
  dropdownPos: { top: number; left: number } | null;
  recipientAddr: string;
  setRecipientAddr: (v: string) => void;
  recipientIsSelf: boolean;
  setRecipientIsSelf: (v: boolean) => void;
  walletAddress?: string;
  stepRef: (el: HTMLDivElement | null) => void;
}

export function SelectDestinationStep({
  status,
  destChainId,
  setDestChainId,
  destConfirmed,
  setDestConfirmed,
  chainDropdownOpen,
  setChainDropdownOpen,
  chainDropdownRef,
  chainTriggerRef,
  dropdownPos,
  recipientAddr,
  setRecipientAddr,
  recipientIsSelf,
  setRecipientIsSelf,
  walletAddress,
  stepRef,
}: Props) {
  return (
    <StepCard
      index={1}
      status={status}
      title="Select Destination"
      description="Choose which chain and recipient to move the tokens to after receiving them on this address."
      stepRef={stepRef}
    >
      {!destConfirmed ? (
        <DestinationForm
          status={status}
          destChainId={destChainId}
          setDestChainId={setDestChainId}
          setDestConfirmed={setDestConfirmed}
          chainDropdownOpen={chainDropdownOpen}
          setChainDropdownOpen={setChainDropdownOpen}
          chainDropdownRef={chainDropdownRef}
          chainTriggerRef={chainTriggerRef}
          dropdownPos={dropdownPos}
          recipientAddr={recipientAddr}
          setRecipientAddr={setRecipientAddr}
          recipientIsSelf={recipientIsSelf}
          setRecipientIsSelf={setRecipientIsSelf}
          walletAddress={walletAddress}
        />
      ) : (
        <DestinationConfirmed
          destChainId={destChainId}
          recipientIsSelf={recipientIsSelf}
          recipientAddr={recipientAddr}
          walletAddress={walletAddress}
        />
      )}
    </StepCard>
  );
}

/* ── Sub-components ──────────────────────────────────────────────── */

function DestinationForm({
  status,
  destChainId,
  setDestChainId,
  setDestConfirmed,
  chainDropdownOpen,
  setChainDropdownOpen,
  chainDropdownRef,
  chainTriggerRef,
  dropdownPos,
  recipientAddr,
  setRecipientAddr,
  recipientIsSelf,
  setRecipientIsSelf,
  walletAddress,
}: Omit<Props, "destConfirmed" | "stepRef">) {
  const selfPlaceholder = walletAddress
    ? `Self (${shortAddr(walletAddress)})`
    : "Self";

  return (
    <>
      <div className="chain-step-action">
        {/* Chain selector */}
        <div className="chain-select">
          <button
            ref={chainTriggerRef}
            className="chain-select-trigger"
            onClick={() => setChainDropdownOpen((o: boolean) => !o)}
            disabled={status === "pending"}
          >
            <span
              className="chain-dot-lg"
              style={{ background: CHAIN_META[destChainId].color }}
            />
            <span className="chain-select-name">
              {CHAIN_META[destChainId].name}
            </span>
            <ChevronDown
              size={15}
              className={`chain-chevron${chainDropdownOpen ? " chain-chevron--open" : ""}`}
            />
          </button>

          {chainDropdownOpen && dropdownPos && (
            <div
              ref={chainDropdownRef}
              className="chain-dropdown"
              style={{
                top: dropdownPos.top,
                left: dropdownPos.left,
                transform: "translateX(-50%)",
              }}
            >
              {DEST_CHAINS.map((chain) => (
                <button
                  key={chain.id}
                  className={`chain-option${chain.id === destChainId ? " chain-option--active" : ""}`}
                  onClick={() => {
                    setDestChainId(chain.id);
                    setChainDropdownOpen(false);
                  }}
                >
                  <span
                    className="chain-dot-lg"
                    style={{ background: CHAIN_META[chain.id].color }}
                  />
                  <span>{CHAIN_META[chain.id].name}</span>
                  {chain.id === destChainId && (
                    <Check size={14} className="chain-option-check" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recipient input — always visible */}
      <div className="recipient-input-wrap">
        <input
          type="text"
          className={`recipient-input${
            recipientAddr && !isValidAddress(recipientAddr)
              ? " recipient-input--invalid"
              : ""
          }`}
          placeholder={selfPlaceholder}
          value={recipientAddr}
          onChange={(e) => {
            const val = e.target.value.trim();
            setRecipientAddr(val);
            setRecipientIsSelf(val === "");
          }}
          disabled={status === "pending"}
          spellCheck={false}
          autoComplete="off"
        />
      </div>

      {/* Continue */}
      <div className="btn-continue-wrap">
        <button
          className="btn-continue-full"
          onClick={() => setDestConfirmed(true)}
          disabled={
            status === "pending" ||
            (!recipientIsSelf && !isValidAddress(recipientAddr))
          }
        >
          Continue
        </button>
      </div>
    </>
  );
}

function DestinationConfirmed({
  destChainId,
  recipientIsSelf,
  recipientAddr,
  walletAddress,
}: {
  destChainId: number;
  recipientIsSelf: boolean;
  recipientAddr: string;
  walletAddress?: string;
}) {
  return (
    <div className="dest-confirmed-details">
      <div className="done-row">
        <span className="done-badge">
          <Check size={11} strokeWidth={3} />
          Chain
        </span>
        <span className="done-value done-value--chain">
          <span
            className="chain-dot-sm"
            style={{ background: CHAIN_META[destChainId].color }}
          />
          {CHAIN_META[destChainId].name}
        </span>
      </div>
      <div className="done-row">
        <span className="done-badge">
          <Check size={11} strokeWidth={3} />
          Recipient
        </span>
        <span className="done-value done-value--recipient">
          {recipientIsSelf
            ? `Self (${shortAddr(walletAddress || "")})`
            : shortAddr(recipientAddr)}
        </span>
      </div>
    </div>
  );
}

