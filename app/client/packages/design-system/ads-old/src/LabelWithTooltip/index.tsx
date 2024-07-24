import React, { useCallback, useRef, useState } from "react";
import styled, { css } from "styled-components";
import { Alignment, Classes, Label } from "@blueprintjs/core";

import { LabelPosition } from "../types/common";
import { FontStyleTypes } from "../constants/typography";
import Tooltip from "../Tooltip";
import { IconWrapper } from "../Icon";
import { importSvg } from "../utils/icon-loadables";

const HelpIcon = importSvg(
  async () => import("../assets/icons/control/help.svg"),
);

export interface LabelWithTooltipProps {
  alignment?: Alignment;
  className?: string;
  color?: string;
  compact: boolean;
  disabled?: boolean;
  fontSize?: string;
  fontStyle?: string;
  helpText?: string;
  cyHelpTextClassName?: string;
  inline?: boolean;
  loading?: boolean;
  optionCount?: number;
  position?: LabelPosition;
  text: string;
  width?: number;
}

export interface LabelContainerProps {
  alignment?: Alignment;
  compact: boolean;
  inline?: boolean;
  optionCount?: number;
  position?: LabelPosition;
  width?: number;
}

export interface StyledLabelProps {
  color?: string;
  compact: boolean;
  disabled?: boolean;
  fontSize?: string;
  fontStyle?: string;
  hasHelpText: boolean;
  position?: LabelPosition;
}

interface TooltipIconProps {
  compact: boolean;
  position?: LabelPosition;
}

/**
 * Class name for a label container
 */
export const LABEL_CONTAINER_CLASS = "label-container";

/**
 * Max width of the label, specified in percentage(%)
 */
export const LABEL_MAX_WIDTH_RATE = 70;

/**
 * Default margin-top or margin-right value between label, help text and input
 */
export const LABEL_DEFAULT_GAP = "5px";

/**
 * The amount of time in milliseconds the popover on the label with ellipsis
 * should wait before opening after the user hovers over the trigger
 */
export const LABEL_TOOLTIP_OPEN_DELAY = 200;

/**
 * Default label width in percentage
 */
export const LABEL_DEFAULT_WIDTH_RATE = 33;

/**
 * Size of the icon used as a tooltip target, in pixels
 */
export const TOOLTIP_ICON_SIZE = 14;

/**
 * checks if ellipsis is active
 * this function is meant for checking the existence of ellipsis by CSS.
 * Since ellipsis by CSS are not part of DOM, we are checking with scroll width\height and offsetidth\height.
 * ScrollWidth\ScrollHeight is always greater than the offsetWidth\OffsetHeight when ellipsis made by CSS is active.
 * Using clientWidth to fix this https://stackoverflow.com/a/21064102/8692954
 * @param element
 */
const isEllipsisActive = (element: HTMLElement | null) => {
  return element && element.clientWidth < element.scrollWidth;
};

export const labelLayoutStyles = css<{
  compactMode: boolean;
  labelPosition?: LabelPosition;
}>`
  display: flex;
  flex-direction: ${({ compactMode, labelPosition }) => {
    if (labelPosition === LabelPosition.Left) return "row";
    if (labelPosition === LabelPosition.Top) return "column";
    if (compactMode) return "row";
    return "column";
  }};

  align-items: ${({ compactMode, labelPosition }) => {
    if (labelPosition === LabelPosition.Top) return "flex-start";
    if (compactMode) return "center";
    return "flex-start";
  }};
  justify-content: flex-start;
`;

export const multiSelectInputContainerStyles = css<{
  compactMode: boolean;
  labelPosition?: LabelPosition;
}>`
  width: 100%;
  height: 100%;
  display: flex;
  align-items: ${({ compactMode, labelPosition }) => {
    if (labelPosition === LabelPosition.Top) return "flex-start";
    if (labelPosition === LabelPosition.Left) return "center";
    if (compactMode) return "center";
    return "flex-start";
  }};
`;

const LabelContainer = styled.div<LabelContainerProps>`
  &&& {
    display: flex;
    align-items: center;
    flex-grow: 0;
  }

  ${({ alignment, compact, inline, optionCount, position, width }) => `
      ${width && `width: ${width}px`};
    ${
      position !== LabelPosition.Top &&
      (position === LabelPosition.Left || compact)
        ? `&&& {margin-right: ${LABEL_DEFAULT_GAP}; flex-shrink: 0;} max-width: ${LABEL_MAX_WIDTH_RATE}%;`
        : `width: 100%;`
    }
    ${
      position === LabelPosition.Left &&
      `
      ${!width && `width: ${LABEL_DEFAULT_WIDTH_RATE}%`};
      ${alignment === Alignment.RIGHT && `justify-content: flex-end`};
      label {
        ${
          alignment === Alignment.RIGHT
            ? `text-align: right`
            : `text-align: left`
        };
      }
    `
    }

    ${!inline && optionCount && optionCount > 1 && `align-self: flex-start;`}
  `}
`;

export const StyledTooltip = styled(Tooltip)`
  overflow: hidden;
`;

export const StyledLabel = styled(Label)<StyledLabelProps>`
  &&& {
    ${({ compact, hasHelpText, position }) => {
      if (position == null && !compact) return;
      if (
        position === LabelPosition.Left ||
        ((position == null || position === LabelPosition.Auto) && compact)
      )
        return `margin-bottom: 0px; margin-right: ${LABEL_DEFAULT_GAP}`;
      return `margin-bottom: ${LABEL_DEFAULT_GAP}; ${
        hasHelpText ? `margin-right: ${LABEL_DEFAULT_GAP}` : "margin-right: 0px"
      }`;
    }};

    ${({ color, disabled, fontSize, fontStyle }) => `
      color: ${
        disabled
          ? "var(--ads-label-with-tooltip-default-text-color)"
          : color || "inherit"
      };
      font-size: ${fontSize ?? "inherit"};
      font-weight: ${
        fontStyle?.includes(FontStyleTypes.BOLD) ? "bold" : "normal"
      };
      font-style: ${
        fontStyle?.includes(FontStyleTypes.ITALIC) ? "italic" : "normal"
      };
    `}
  }
`;

const ToolTipIcon = styled(IconWrapper)<TooltipIconProps>`
  cursor: help;
  &&&:hover {
    svg {
      path {
        fill: var(--ads-label-with-tooltip-hover-icon-fill-color);
      }
    }
  }

  ${({ compact, position }) => {
    if (position === LabelPosition.Top) {
      return `margin-bottom: ${LABEL_DEFAULT_GAP}`;
    }
    if (compact || position === LabelPosition.Left) return "margin-bottom: 0px";
    return `margin-bottom: ${LABEL_DEFAULT_GAP}`;
  }};
`;

const LabelWithTooltip = React.forwardRef<
  HTMLDivElement,
  LabelWithTooltipProps
>((props, ref) => {
  const {
    alignment,
    className,
    color,
    compact,
    cyHelpTextClassName,
    disabled,
    fontSize,
    fontStyle,
    helpText,
    inline,
    loading,
    optionCount,
    position,
    text,
    width,
  } = props;

  const [tooltipOpen, setTooltipOpen] = useState(false);

  const labelRef = useRef<HTMLLabelElement | null>(null);

  const handleMouseEnter = useCallback(() => {
    if (isEllipsisActive(labelRef.current)) {
      setTooltipOpen(true);
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    setTooltipOpen(false);
  }, []);

  return (
    <LabelContainer
      alignment={alignment}
      className={LABEL_CONTAINER_CLASS}
      compact={compact}
      data-cy={LABEL_CONTAINER_CLASS}
      inline={inline}
      optionCount={optionCount}
      position={position}
      ref={ref}
      width={width}
    >
      <StyledTooltip
        content={text}
        hoverOpenDelay={LABEL_TOOLTIP_OPEN_DELAY}
        isOpen={tooltipOpen}
        position="top"
      >
        <StyledLabel
          className={`${
            loading ? Classes.SKELETON : Classes.TEXT_OVERFLOW_ELLIPSIS
          } ${className}`}
          color={color}
          compact={compact}
          disabled={disabled}
          elementRef={labelRef}
          fontSize={fontSize}
          fontStyle={fontStyle}
          hasHelpText={!!helpText}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          position={position}
        >
          {text}
        </StyledLabel>
      </StyledTooltip>
      {helpText && (
        <Tooltip
          content={helpText}
          hoverOpenDelay={LABEL_TOOLTIP_OPEN_DELAY}
          position="top"
        >
          <ToolTipIcon
            color={"var(--ads-label-with-tooltip-default-icon-fill-color)"}
            compact={compact}
            position={position}
          >
            <HelpIcon className={cyHelpTextClassName} />
          </ToolTipIcon>
        </Tooltip>
      )}
    </LabelContainer>
  );
});
LabelWithTooltip.displayName = "LabelWithTooltip";

export default LabelWithTooltip;