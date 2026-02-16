"use client";

import { useState, useRef, useEffect, type RefObject } from "react";
import { Check, ChevronDown } from "lucide-react";
import type { StepStatus } from "../../types";
import { shortAddr, isValidAddress } from "../../utils";
import { CHAIN_META, DEST_CHAINS } from "../../constants";
import { TOKEN_SYMBOLS, SUPPORTED_TOKENS } from "../../config";
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
  recipientTokenSymbol: string | undefined;
  setRecipientTokenSymbol: (v: string | undefined) => void;
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
  recipientTokenSymbol,
  setRecipientTokenSymbol,
  walletAddress,
  stepRef,
}: Props) {
  return (
    <StepCard
      index={1}
      status={status}
      title="Select Destination"
      description="Choose which chain, recipient token, and recipient address to move the tokens to after receiving them."
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
          recipientTokenSymbol={recipientTokenSymbol}
          setRecipientTokenSymbol={setRecipientTokenSymbol}
          walletAddress={walletAddress}
        />
      ) : (
        <DestinationConfirmed
          destChainId={destChainId}
          recipientIsSelf={recipientIsSelf}
          recipientAddr={recipientAddr}
          recipientTokenSymbol={recipientTokenSymbol}
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
  recipientTokenSymbol,
  setRecipientTokenSymbol,
  walletAddress,
}: Omit<Props, "destConfirmed" | "stepRef">) {
  const selfPlaceholder = walletAddress
    ? `Self (${shortAddr(walletAddress)})`
    : "Self";

  // Token dropdown state
  const [tokenDropdownOpen, setTokenDropdownOpen] = useState(false);
  const tokenDropdownRef = useRef<HTMLDivElement>(null);
  const tokenTriggerRef = useRef<HTMLButtonElement>(null);
  const [tokenDropdownPos, setTokenDropdownPos] = useState<{
    top: number;
    left: number;
  } | null>(null);

  // Token dropdown: outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        tokenDropdownRef.current &&
        !tokenDropdownRef.current.contains(e.target as Node) &&
        tokenTriggerRef.current &&
        !tokenTriggerRef.current.contains(e.target as Node)
      ) {
        setTokenDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Token dropdown: position relative to trigger
  useEffect(() => {
    if (tokenDropdownOpen && tokenTriggerRef.current) {
      const rect = tokenTriggerRef.current.getBoundingClientRect();
      setTokenDropdownPos({
        top: rect.top - 6,
        left: rect.left + rect.width / 2,
      });
    }
  }, [tokenDropdownOpen]);

  const displayTokenSymbol = recipientTokenSymbol ?? "Same as input";
  const tokenOptions = [
    { value: undefined as string | undefined, label: "Same as input" },
    ...TOKEN_SYMBOLS.map((sym) => ({
      value: sym as string | undefined,
      label: `${sym} — ${SUPPORTED_TOKENS[sym].name}`,
    })),
  ];

  return (
    <>
      <div className="dest-fields">
        {/* Destination chain */}
        <div className="dest-field">
          <label className="dest-field-label">Destination Chain</label>
          <div className="chain-select">
            <button
              ref={chainTriggerRef}
              className="chain-select-trigger chain-select-trigger--full"
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
                className="chain-dropdown chain-dropdown--above"
                style={{
                  bottom: `calc(100vh - ${dropdownPos.top}px)`,
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

        {/* Recipient address */}
        <div className="dest-field">
          <label className="dest-field-label">Recipient Address</label>
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
          {recipientIsSelf && (
            <span className="dest-field-hint">
              Leave empty to send to your own wallet
            </span>
          )}
        </div>

        {/* Destination token */}
        <div className="dest-field">
          <label className="dest-field-label">Destination Token</label>
          <div className="chain-select">
            <button
              ref={tokenTriggerRef}
              className="chain-select-trigger chain-select-trigger--full"
              onClick={() => setTokenDropdownOpen((o) => !o)}
              disabled={status === "pending"}
            >
              <span className="chain-select-name">
                {displayTokenSymbol}
              </span>
              <ChevronDown
                size={15}
                className={`chain-chevron${tokenDropdownOpen ? " chain-chevron--open" : ""}`}
              />
            </button>

            {tokenDropdownOpen && tokenDropdownPos && (
              <div
                ref={tokenDropdownRef}
                className="chain-dropdown chain-dropdown--above"
                style={{
                  bottom: `calc(100vh - ${tokenDropdownPos.top}px)`,
                  left: tokenDropdownPos.left,
                  transform: "translateX(-50%)",
                }}
              >
                {tokenOptions.map((opt) => (
                  <button
                    key={opt.value ?? "__same__"}
                    className={`chain-option${
                      recipientTokenSymbol === opt.value
                        ? " chain-option--active"
                        : ""
                    }`}
                    onClick={() => {
                      setRecipientTokenSymbol(opt.value);
                      setTokenDropdownOpen(false);
                    }}
                  >
                    <span>{opt.label}</span>
                    {recipientTokenSymbol === opt.value && (
                      <Check size={14} className="chain-option-check" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
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
  recipientTokenSymbol,
  walletAddress,
}: {
  destChainId: number;
  recipientIsSelf: boolean;
  recipientAddr: string;
  recipientTokenSymbol: string | undefined;
  walletAddress?: string;
}) {
  return (
    <div className="dest-confirmed-details">
      <div className="done-row">
        <span className="done-badge">
          <Check size={11} strokeWidth={3} />
          Destination Chain
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
          Recipient Address
        </span>
        <span className="done-value done-value--recipient">
          {recipientIsSelf
            ? `Self (${shortAddr(walletAddress || "")})`
            : shortAddr(recipientAddr)}
        </span>
      </div>
      <div className="done-row">
        <span className="done-badge">
          <Check size={11} strokeWidth={3} />
          Destination Token
        </span>
        <span className="done-value">
          {recipientTokenSymbol ?? "Same as input"}
        </span>
      </div>
    </div>
  );
}

