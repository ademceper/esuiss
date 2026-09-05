/* eslint-disable */

// @ts-nocheck

import { Label } from "../../shared/@patternfly/react-core";
import { CheckCircleIcon } from "../../shared/@patternfly/react-icons";
import { useTranslation } from "react-i18next";

export const BuildInLabel = () => {
  const { t } = useTranslation();

  return (
    <Label icon={<CheckCircleIcon />}>
      {t("buildIn")}
    </Label>
  );
};
