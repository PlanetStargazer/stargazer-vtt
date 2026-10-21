<?php
declare(strict_types=1);

/**
 * Parses and rolls RPG dice expressions such as:
 *   2d6, 3d10, d6+4, 4dF, 2d20kh1+5, 4d6kh3, 1d100, 2d8+1d6-2
 */
class DiceRoller {
    public static function roll(string $expression): array {
        $raw = trim($expression);
        if ($raw === '') {
            throw new InvalidArgumentException('Please provide a dice formula (e.g. 2d6, d20+4, 4dF).');
        }

        // Extract optional comment/label after # orfirst space after valid dice terms
        $label = '';
        if (preg_match('/^([^\s#]+(?:\s*[+\-]\s*[^\s#]+)*)\s+(?:(?:#\s*)?(.+))$/i', $raw, $m)) {
            $formulaPart = $m[1];
            $label = trim($m[2]);
        } else {
            $formulaPart = $raw;
        }

        $clean = preg_replace('/\s+/', '', $formulaPart);
        if ($clean === '' || !preg_match('/^[0-9dDfFkKhHlLcCsS><=+\-]+$/', $clean)) {
            throw new InvalidArgumentException('Invalid dice code: "' . htmlspecialchars($raw) . '". Examples: 2d6, 3d10, d6+4, 4dF, 6d6>=5.');
        }

        // Split into signed tokens (+ or -)
        preg_match_all('/([+\-]?)([^+\-]+)/', $clean, $matches, PREG_SET_ORDER);
        if (empty($matches)) {
            throw new InvalidArgumentException('Could not parse dice formula.');
        }

        $total = 0;
        $diceList = [];
        $breakdownParts = [];
        $totalDiceCount = 0;
        $hasSuccessPool = false;

        foreach ($matches as $idx => $tokenMatch) {
            $signStr = $tokenMatch[1];
            $sign = ($signStr === '-') ? -1 : 1;
            $term = $tokenMatch[2];

            if (stripos($term, 'd') !== false) {
                // Dice term: [count]d(sides|F)[khN|klN][(?:cs|s)?(>=|<=|>|<|=)(\d+)]
                if (!preg_match('/^(\d*)d(f|\d+)(?:k([hl])(\d+))?(?:(?:cs|s)?(>=|<=|>|<|=)(\d+))?$/i', $term, $dm)) {
                    throw new InvalidArgumentException("Invalid dice term: {$term}");
                }
                $count = ($dm[1] === '') ? 1 : (int)$dm[1];
                if ($count < 1 || $count > 50) {
                    throw new InvalidArgumentException('Dice count per group must be between 1 and 50.');
                }
                $totalDiceCount += $count;
                if ($totalDiceCount > 60) {
                    throw new InvalidArgumentException('Maximum 60 dice per roll.');
                }

                $sidesRaw = strtolower($dm[2]);
                $keepMode = !empty($dm[3]) ? strtolower($dm[3]) : null;
                $keepCount = !empty($dm[4]) ? (int)$dm[4] : null;
                $cmpOp = !empty($dm[5]) ? $dm[5] : null;
                $cmpTarget = (isset($dm[6]) && $dm[6] !== '') ? (int)$dm[6] : null;

                $isFudge = ($sidesRaw === 'f');
                $sides = $isFudge ? 3 : (int)$sidesRaw;
                if (!$isFudge && ($sides < 2 || $sides > 1000)) {
                    throw new InvalidArgumentException('Dice sides must be between 2 and 1000.');
                }

                $dieModelType = self::resolve3DModelType($isFudge, $sides);
                $groupRolls = [];

                for ($i = 0; $i < $count; $i++) {
                    if ($isFudge) {
                        $val = random_int(-1, 1);
                        $disp = $val === 1 ? '+' : ($val === -1 ? '−' : '0');
                    } else {
                        $val = random_int(1, $sides);
                        $disp = (string)$val;
                    }
                    $groupRolls[] = [
                        'index' => $i,
                        'value' => $val,
                        'display' => $disp,
                        'type' => $dieModelType,
                        'sides' => $isFudge ? 'F' : $sides,
                        'dropped' => false,
                        'success' => null,
                    ];
                }

                // Handle keep highest / keep lowest if specified
                if ($keepMode !== null && $keepCount !== null && $keepCount < $count && $keepCount >= 0) {
                    $indices = range(0, $count - 1);
                    usort($indices, function ($a, $b) use ($groupRolls, $keepMode) {
                        return $keepMode === 'h'
                            ? ($groupRolls[$b]['value'] <=> $groupRolls[$a]['value'])
                            : ($groupRolls[$a]['value'] <=> $groupRolls[$b]['value']);
                    });
                    $keptSet = array_flip(array_slice($indices, 0, $keepCount));
                    foreach ($groupRolls as $gi => &$gr) {
                        if (!isset($keptSet[$gi])) {
                            $gr['dropped'] = true;
                        }
                    }
                    unset($gr);
                }

                $groupSum = 0;
                $rollStrings = [];
                foreach ($groupRolls as &$gr) {
                    if ($cmpOp !== null && $cmpTarget !== null) {
                        $hasSuccessPool = true;
                        $v = $gr['value'];
                        $isSuccess = match ($cmpOp) {
                            '>=' => $v >= $cmpTarget,
                            '>'  => $v > $cmpTarget,
                            '<=' => $v <= $cmpTarget,
                            '<'  => $v < $cmpTarget,
                            '='  => $v === $cmpTarget,
                            default => false,
                        };
                        $gr['success'] = $isSuccess;
                        if (!$gr['dropped']) {
                            if ($isSuccess) {
                                $groupSum += 1;
                                $rollStrings[] = $gr['display'] . '✓';
                            } else {
                                $rollStrings[] = $gr['display'];
                            }
                        } else {
                            $rollStrings[] = '~~' . $gr['display'] . '~~';
                        }
                    } else {
                        if (!$gr['dropped']) {
                            $groupSum += $gr['value'];
                            $rollStrings[] = $gr['display'];
                        } else {
                            $rollStrings[] = '~~' . $gr['display'] . '~~';
                        }
                    }
                    $diceList[] = $gr;
                }
                unset($gr);

                $total += $sign * $groupSum;
                $prefix = ($idx === 0) ? ($sign === -1 ? '-' : '') : ($sign === -1 ? ' - ' : ' + ');
                $termLabel = $count . 'd' . ($isFudge ? 'F' : $sides)
                    . ($keepMode ? "k{$keepMode}{$keepCount}" : '')
                    . ($cmpOp !== null ? "{$cmpOp}{$cmpTarget}" : '');
                $breakdownParts[] = $prefix . $termLabel . ' [' . implode(', ', $rollStrings) . ']';
            } else {
                // Static numeric modifier
                if (!ctype_digit($term)) {
                    throw new InvalidArgumentException("Invalid modifier: {$term}");
                }
                $mod = (int)$term;
                $total += $sign * $mod;
                $prefix = ($idx === 0) ? ($sign === -1 ? '-' : '') : ($sign === -1 ? ' - ' : ' + ');
                $breakdownParts[] = $prefix . $mod;
            }
        }

        if (empty($diceList)) {
            throw new InvalidArgumentException('Formula must include at least one die (e.g. 1d20, 2d6, 4dF).');
        }

        return [
            'formula' => $clean,
            'label' => $label,
            'total' => $total,
            'is_success_pool' => $hasSuccessPool,
            'dice' => $diceList,
            'breakdown' => implode('', $breakdownParts),
        ];
    }

    private static function resolve3DModelType(bool $isFudge, int $sides): string {
        if ($isFudge) return 'dF';
        if (in_array($sides, [4, 6, 8, 10, 12, 20, 100], true)) {
            return 'd' . $sides;
        }
        // Map non-standard die sizes to closest polyhedron for 3D rendering
        if ($sides <= 4) return 'd4';
        if ($sides <= 6) return 'd6';
        if ($sides <= 8) return 'd8';
        if ($sides <= 10) return 'd10';
        if ($sides <= 12) return 'd12';
        return 'd20';
    }
}
