// Mock responses for PoB Lua API (CommonJS)

export const MOCK_RESPONSES = {
  ready: { ready: true },
  ping: { ok: true },
  load_build_xml: { ok: true },
  get_stats: {
    ok: true,
    stats: {
      Life: 5000,
      EnergyShield: 0,
      Mana: 1000,
      TotalDPS: 1000000,
      CritChance: 75,
      CritMultiplier: 350,
      Armour: 15000,
      Evasion: 5000,
      FireResist: 75,
      ColdResist: 75,
      LightningResist: 75,
      ChaosResist: 20,
      BlockChance: 0,
      SpellBlockChance: 0,
      LifeRegen: 500,
      ManaRegen: 100,
    },
  },
  get_tree: {
    ok: true,
    tree: {
      treeVersion: '3_26',
      classId: 2,
      ascendClassId: 1,
      secondaryAscendClassId: 0,
      nodes: [1, 2, 3, 4, 5, 26725, 36858],
      masteryEffects: {},
    },
  },
  set_tree: { ok: true },
  get_items: {
    ok: true,
    items: [
      {
        slot: 'Weapon 1',
        id: 1,
        name: 'Death Bow',
        baseName: 'Thicket Bow',
        type: 'Bow',
        rarity: 'RARE',
        raw: 'Rarity: Rare\nDeath Bow\nThicket Bow',
      },
      {
        slot: 'Body Armour',
        id: 0,
      },
      {
        slot: 'Flask 1',
        id: 10,
        name: 'Diamond Flask',
        baseName: 'Diamond Flask',
        rarity: 'MAGIC',
        active: false,
      },
    ],
  },
  add_item_text: {
    ok: true,
    result: {
      id: 123,
      name: 'Steel Blade',
      slot: 'Weapon 1',
    },
  },
  set_flask_active: { ok: true },
  get_skills: {
    ok: true,
    result: {
      mainSocketGroup: 1,
      calcsSkillNumber: 1,
      groups: [
        {
          index: 1,
          label: 'Main 6L',
          slot: 'Body Armour',
          enabled: true,
          includeInFullDPS: true,
          mainActiveSkill: 1,
          skills: [
            'Lightning Arrow',
            'Greater Multiple Projectiles',
            'Elemental Damage with Attacks',
            'Inspiration Support',
            'Mirage Archer Support',
            'Elemental Focus Support',
          ],
        },
        {
          index: 2,
          label: 'Movement',
          slot: 'Boots',
          enabled: true,
          includeInFullDPS: false,
          mainActiveSkill: 1,
          skills: ['Dash', 'Second Wind Support'],
        },
      ],
    },
  },
  set_main_selection: { ok: true },
  get_config: {
    ok: true,
    config: {
      bandit: 'None',
      pantheonMajorGod: 'Soul of Lunaris',
      pantheonMinorGod: 'Soul of Shakari',
      enemyLevel: 84,
    },
  },
  set_config: {
    ok: true,
    config: {
      bandit: 'Alira',
      pantheonMajorGod: 'Soul of Solaris',
      pantheonMinorGod: 'Soul of Gruthkul',
      enemyLevel: 85,
    },
  },
  export_build_xml: {
    ok: true,
    xml: '<?xml version="1.0" encoding="UTF-8"?>\n<PathOfBuilding>...</PathOfBuilding>',
  },
  get_build_info: {
    ok: true,
    info: {
      name: 'Test Build',
      level: 90,
      className: 'Ranger',
      ascendClassName: 'Deadeye',
      treeVersion: '3_26',
    },
  },
  set_level: { ok: true },
  update_tree_delta: { ok: true },
  calc_with: {
    ok: true,
    output: {
      Life: 5500,
      TotalDPS: 1100000,
    },
  },
};

// Error responses
export const MOCK_ERROR_RESPONSES = {
  invalid_xml: {
    ok: false,
    error: 'Failed to parse XML',
  },
  invalid_node: {
    ok: false,
    error: 'Invalid node ID',
  },
  build_not_initialized: {
    ok: false,
    error: 'build not initialized',
  },
  invalid_params: {
    ok: false,
    error: 'invalid params',
  },
  invalid_level: {
    ok: false,
    error: 'invalid level',
  },
};

// Sample build XML for testing
export const SAMPLE_BUILD_XML = `<?xml version="1.0" encoding="UTF-8"?>
<PathOfBuilding>
  <Build level="90" targetVersion="3_26" bandit="None" className="Ranger" ascendClassName="Deadeye">
    <PlayerStat stat="Life" value="5000"/>
    <PlayerStat stat="TotalDPS" value="1000000"/>
    <PlayerStat stat="CritChance" value="75"/>
  </Build>
</PathOfBuilding>`;

// Sample item texts
export const SAMPLE_ITEMS = {
  weapon: `Rarity: Rare
Death Spiral
Thicket Bow
Quality: +20%
Physical Damage: 78-145
Adds 15 to 28 Physical Damage
+35% to Global Critical Strike Multiplier`,

  armor: `Rarity: Rare
Dragon Carapace
Astral Plate
+96 to maximum Life
+45% to Fire Resistance`,

  flask: `Rarity: Magic
Chemist's Diamond Flask of the Order
Your Critical Strike Chance is Lucky`,
};
