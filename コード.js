/**
 * 人事DX 入社手続き自動化ポートフォリオ
 * 第1段階：入社登録Googleフォームと回答先スプレッドシートの作成（setupOnboardingForm）
 * 第2段階：社員台帳への登録（setupEmployeeLedger）
 * 第3段階：雇用契約書（下書き）の自動作成（setupEmploymentContracts）
 * 第4段階：契約終了まで30日以内の対象者の抽出（extractContractsEndingSoon）
 * 第5段階：毎朝のメール通知（notifyContractsEndingSoon）と時間主導トリガー（setupDailyNotificationTrigger）
 *
 * 使い方：GASエディタで各段階の setup 関数を、段階の順に選んで実行する。
 * 何度実行しても、同じフォーム・スプレッドシート・シート・フォルダ・テンプレートは重複して作られない。
 */

// ============================================================
// 設定値（名前や選択肢はここだけで管理する）
// ============================================================

/** フォームの名前と説明 */
const FORM_TITLE = '入社登録フォーム_ポートフォリオ';
const FORM_DESCRIPTION =
  'このフォームは人事DX自主演習用です。\n' +
  '入力データはすべて架空の人物を使用します。';

/** 回答先スプレッドシートの名前と、回答を保存するシートの名前 */
const SPREADSHEET_NAME = '人事DX_入社管理_ポートフォリオ';
const RESPONSE_SHEET_NAME = 'フォーム回答';

/** スプレッドシートを作ったときに最初からある空のシート（言語設定で名前が変わる） */
const INITIAL_SHEET_NAMES = ['シート1', 'Sheet1'];

/** Script Properties に保存するときの名前（キー） */
const PROPERTY_KEYS = {
  FORM_ID: 'FORM_ID',
  SPREADSHEET_ID: 'SPREADSHEET_ID',
};

/** セクション（ページ）の見出し */
const SECTION_TITLES = {
  RENEWAL_CRITERIA: '契約更新の条件',
  RENEWAL_LIMIT: '更新上限の内容',
  WORK_CONDITIONS: '就業条件',
};

/** 質問の文言 */
const QUESTIONS = {
  INPUT_STAFF: '入力担当者名',
  NAME: '氏名',
  NAME_KANA: 'フリガナ',
  BIRTH_DATE: '生年月日',
  EMAIL: '連絡用メールアドレス',
  PHONE: '電話番号',
  POSTAL_CODE: '郵便番号',
  ADDRESS: '住所',
  DEPARTMENT: '所属部署',
  POSITION: '役職',
  CONTRACT_START: '契約開始日（入社日）',
  CONTRACT_END: '契約終了日',
  RENEWAL: '契約更新',
  RENEWAL_CRITERIA: '更新判断基準',
  RENEWAL_LIMIT: '更新上限',
  RENEWAL_LIMIT_DETAIL: '更新上限の内容',
  WORKPLACE_INITIAL: '就業場所（雇入れ直後）',
  WORKPLACE_SCOPE: '就業場所の変更範囲',
  DUTIES_INITIAL: '業務内容（雇入れ直後）',
  DUTIES_SCOPE: '業務内容の変更範囲',
  START_TIME: '始業時刻',
  END_TIME: '終業時刻',
  BREAK_MINUTES: '休憩時間（分）',
  OVERTIME: '時間外労働',
  HOLIDAYS: '休日・休暇',
  BASE_SALARY: '基本給（月額）',
  ALLOWANCES: '諸手当',
};

/** 選択肢 */
const CHOICES = {
  RENEWAL_POSSIBLE: '更新する場合がある',
  RENEWAL_NONE: '更新しない',
  RENEWAL_CRITERIA: [
    '契約期間満了時の業務量',
    '勤務成績・勤務態度',
    '能力',
    '従事している業務の進捗状況',
    '会社の経営状況',
  ], // 「その他」はフォーム標準の自由入力オプションで追加する
  LIMIT_NONE: 'なし',
  LIMIT_EXISTS: 'あり',
  OVERTIME: ['あり', 'なし'],
};

/** 入力チェック */
const POSTAL_CODE_PATTERN = '^[0-9]{3}-?[0-9]{4}$'; // 123-4567 または 1234567
const MIN_NUMBER_VALUE = 0;
const VALIDATION_MESSAGES = {
  EMAIL: 'メールアドレスの形式で入力してください。',
  POSTAL_CODE: '123-4567 または 1234567 の形式で入力してください。',
  NON_NEGATIVE: '0以上の数値を入力してください。',
};

/** 回答シートが作られるのを待つ回数と間隔（ミリ秒） */
const SHEET_WAIT_RETRIES = 5;
const SHEET_WAIT_INTERVAL_MS = 1000;

// ------------------------------------------------------------
// 第2段階：社員台帳
// ------------------------------------------------------------

/** シート名 */
const LEDGER_SHEET_NAME = '社員台帳';
const ERROR_SHEET_NAME = '登録エラー';

/** フォーム回答シートでは、1列目に回答日時（タイムスタンプ）が入る */
const RESPONSE_TIMESTAMP_COLUMN = 1;

/**
 * 社員台帳の見出し（第2段階の30列：A〜AD）。
 * 4列目以降は、フォームの質問（QUESTIONS）を上から順に並べたもの。
 * 第3段階で、この右に契約書の2列（AE・AF）を足す（LEDGER_CONTRACT_HEADERS）。
 */
const LEDGER_FIXED_HEADERS = ['社員番号', '台帳登録日時', 'フォーム回答日時'];
const LEDGER_QUESTION_HEADERS = [
  QUESTIONS.INPUT_STAFF,
  QUESTIONS.NAME,
  QUESTIONS.NAME_KANA,
  QUESTIONS.BIRTH_DATE,
  QUESTIONS.EMAIL,
  QUESTIONS.PHONE,
  QUESTIONS.POSTAL_CODE,
  QUESTIONS.ADDRESS,
  QUESTIONS.DEPARTMENT,
  QUESTIONS.POSITION,
  QUESTIONS.CONTRACT_START,
  QUESTIONS.CONTRACT_END,
  QUESTIONS.RENEWAL,
  QUESTIONS.RENEWAL_CRITERIA,
  QUESTIONS.RENEWAL_LIMIT,
  QUESTIONS.RENEWAL_LIMIT_DETAIL,
  QUESTIONS.WORKPLACE_INITIAL,
  QUESTIONS.WORKPLACE_SCOPE,
  QUESTIONS.DUTIES_INITIAL,
  QUESTIONS.DUTIES_SCOPE,
  QUESTIONS.START_TIME,
  QUESTIONS.END_TIME,
  QUESTIONS.BREAK_MINUTES,
  QUESTIONS.OVERTIME,
  QUESTIONS.HOLIDAYS,
  QUESTIONS.BASE_SALARY,
  QUESTIONS.ALLOWANCES,
];
const LEDGER_BASE_HEADERS = LEDGER_FIXED_HEADERS.concat(LEDGER_QUESTION_HEADERS);

/** 先頭の0が消えないよう、文字として保存する質問 */
const TEXT_QUESTIONS = [QUESTIONS.PHONE, QUESTIONS.POSTAL_CODE];

/** 台帳の列の表示形式 */
const NUMBER_FORMATS = {
  TEXT: '@',
  DATE: 'yyyy/MM/dd',
  DATE_TIME: 'yyyy/MM/dd HH:mm:ss',
  TIME: 'HH:mm',
  INTEGER: '0', // 整数として見せる（登録エラーの「フォーム回答行」、契約終了予定の「残り日数」）
};
/**
 * 時刻の読み取り：「時:分」「時:分:秒」と、後ろに付く AM / PM（あってもなくてもよい）。
 * 文字列全体がこの形でなければ読めない時刻として扱う。
 */
const TIME_TEXT_PATTERN = /^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*([AaPp][Mm]))?$/;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_HALF_DAY = 12;
const MAX_HOUR_24 = 23;
const MAX_MINUTE = 59;
const MAX_SECOND = 59;
const DATE_QUESTIONS = [QUESTIONS.BIRTH_DATE, QUESTIONS.CONTRACT_START, QUESTIONS.CONTRACT_END];
const TIME_QUESTIONS = [QUESTIONS.START_TIME, QUESTIONS.END_TIME];

/** 登録エラーシートの見出し（7列） */
const ERROR_HEADERS = ['発生日時', 'フォーム回答行', '氏名', '連絡用メールアドレス', '生年月日', 'エラー種別', '詳細'];
const ERROR_ROW_COLUMN = 2;  // B列：フォーム回答行
const ERROR_TYPE_COLUMN = 6; // F列：エラー種別

/** エラー種別と詳細 */
const ERROR_TYPES = {
  DUPLICATE: {
    type: '重複',
    detail: '同じメールアドレスと生年月日の社員が既に社員台帳に存在します',
  },
  CONTRACT_PERIOD: {
    type: '契約期間エラー',
    detail: '契約終了日が契約開始日より前です',
  },
  WORK_TIME: {
    type: '勤務時間エラー',
    detail: '終業時刻が始業時刻と同じ、または前です',
  },
};

/** 社員番号：EMP-0001 の形 */
const EMPLOYEE_NUMBER_PREFIX = 'EMP-';
const EMPLOYEE_NUMBER_DIGITS = 4;
const EMPLOYEE_NUMBER_PATTERN = /^EMP-(\d+)$/;
const LAST_EMPLOYEE_NUMBER_KEY = 'LAST_EMPLOYEE_NUMBER';

/** 台帳への書き込みを1件ずつ順番に行うための、ロックを待つ最長時間（ミリ秒） */
const LOCK_TIMEOUT_MS = 30000;

/** フォーム送信時に動かす関数の名前（トリガーの登録と確認に使う） */
const LEDGER_TRIGGER_HANDLER = 'onFormSubmitToLedger';

// ------------------------------------------------------------
// 第3段階：雇用契約書（下書き）
// ------------------------------------------------------------

/** 会社情報（すべて架空） */
const COMPANY_INFO = {
  NAME: 'サンプルリテール株式会社',
  ADDRESS: '架空県架空市中央1-1-1',
  REPRESENTATIVE: '代表取締役 架空 一郎',
};

/** 保存フォルダとテンプレートの名前（テンプレートも保存フォルダに入れる） */
const CONTRACT_FOLDER_NAME = '人事DX_雇用契約書_ポートフォリオ';
const CONTRACT_TEMPLATE_NAME = '雇用契約書テンプレート_ポートフォリオ';

/** Script Properties に保存するときの名前（キー） */
const CONTRACT_PROPERTY_KEYS = {
  FOLDER_ID: 'CONTRACT_FOLDER_ID',
  TEMPLATE_ID: 'CONTRACT_TEMPLATE_ID',
  START_NUMBER: 'CONTRACT_AUTOMATION_START_NUMBER', // 契約書を自動で作る最初の社員番号（数字）
};

/** 契約書のファイル名：雇用契約書_下書き_EMP-0006_架空 十二郎 */
const CONTRACT_FILE_PREFIX = '雇用契約書_下書き_';
const CONTRACT_FILE_SEPARATOR = '_';
/** 差し込みが終わるまでの仮の名前の頭に付ける文字 */
const CONTRACT_DRAFT_PREFIX = '作成中_';

/** 社員台帳に足す2列（AE・AF）。第3段階以降の台帳は32列 */
const CONTRACT_URL_HEADER = '契約書URL';
const CONTRACT_CREATED_HEADER = '契約書作成日時';
const LEDGER_CONTRACT_HEADERS = [CONTRACT_URL_HEADER, CONTRACT_CREATED_HEADER];
const LEDGER_HEADERS = LEDGER_BASE_HEADERS.concat(LEDGER_CONTRACT_HEADERS);

/** シートの1行目は見出し、2行目からがデータ */
const HEADER_ROW = 1;
const FIRST_DATA_ROW = 2;

/** 契約書エラーシートの見出し（7列） */
const CONTRACT_ERROR_SHEET_NAME = '契約書エラー';
const CONTRACT_ERROR_HEADERS = ['発生日時', '社員番号', '氏名', 'エラー種別', '詳細', '対象ファイル名', '対象ファイルURL'];
const CONTRACT_ERROR_TYPES = {
  CREATION: '契約書作成エラー',
};

/**
 * プレースホルダー（差し込み位置の目印）の名前。全部で26個。
 * テンプレートには {{名前}} の形で書く。
 */
const PLACEHOLDER_OPEN = '{{';
const PLACEHOLDER_CLOSE = '}}';
const PLACEHOLDERS = {
  COMPANY_NAME: '会社名',
  COMPANY_ADDRESS: '会社所在地',
  COMPANY_REPRESENTATIVE: '会社代表者',
  EMPLOYEE_NUMBER: '社員番号',
  NAME: '氏名',
  ADDRESS: '住所',
  DEPARTMENT: '所属部署',
  POSITION: '役職',
  CONTRACT_START: '契約開始日',
  CONTRACT_END: '契約終了日',
  RENEWAL: '契約更新',
  RENEWAL_CRITERIA: '更新判断基準',
  RENEWAL_LIMIT: '更新上限',
  RENEWAL_LIMIT_DETAIL: '更新上限の内容',
  WORKPLACE_INITIAL: '就業場所（雇入れ直後）',
  WORKPLACE_SCOPE: '就業場所の変更範囲',
  DUTIES_INITIAL: '業務内容（雇入れ直後）',
  DUTIES_SCOPE: '業務内容の変更範囲',
  START_TIME: '始業時刻',
  END_TIME: '終業時刻',
  BREAK_TIME: '休憩時間',
  OVERTIME: '時間外労働',
  HOLIDAYS: '休日・休暇',
  BASE_SALARY: '基本給',
  ALLOWANCES: '諸手当',
  CREATED_DATE: '契約書作成日',
};

/** 差し込み後に残ったプレースホルダーを探す形（{{ と }} で囲まれた部分） */
const LEFTOVER_PLACEHOLDER_PATTERN = /\{\{[^{}]*\}\}/g;

/** テンプレートの文面 */
const CONTRACT_TEMPLATE_TEXT = {
  TITLE: '雇用契約書（下書き）',
  NOTICE: '本書はポートフォリオ用の架空データによる下書きであり、実際の労務・法務手続に使用するものではありません。',
  INTRO: '使用者と労働者は、次の条件で雇用契約を結ぶ。',
  CREATED_DATE_LABEL: '契約書作成日：',
};

/** テンプレートの節（見出しと、表に並べるプレースホルダー） */
const CONTRACT_TEMPLATE_SECTIONS = [
  {
    heading: '1. 使用者',
    names: [PLACEHOLDERS.COMPANY_NAME, PLACEHOLDERS.COMPANY_ADDRESS, PLACEHOLDERS.COMPANY_REPRESENTATIVE],
  },
  {
    heading: '2. 労働者',
    names: [PLACEHOLDERS.EMPLOYEE_NUMBER, PLACEHOLDERS.NAME, PLACEHOLDERS.ADDRESS,
      PLACEHOLDERS.DEPARTMENT, PLACEHOLDERS.POSITION],
  },
  {
    heading: '3. 契約期間と更新',
    names: [PLACEHOLDERS.CONTRACT_START, PLACEHOLDERS.CONTRACT_END, PLACEHOLDERS.RENEWAL,
      PLACEHOLDERS.RENEWAL_CRITERIA, PLACEHOLDERS.RENEWAL_LIMIT, PLACEHOLDERS.RENEWAL_LIMIT_DETAIL],
  },
  {
    heading: '4. 就業場所と業務内容',
    names: [PLACEHOLDERS.WORKPLACE_INITIAL, PLACEHOLDERS.WORKPLACE_SCOPE,
      PLACEHOLDERS.DUTIES_INITIAL, PLACEHOLDERS.DUTIES_SCOPE],
  },
  {
    heading: '5. 労働時間と休日',
    names: [PLACEHOLDERS.START_TIME, PLACEHOLDERS.END_TIME, PLACEHOLDERS.BREAK_TIME,
      PLACEHOLDERS.OVERTIME, PLACEHOLDERS.HOLIDAYS],
  },
  {
    heading: '6. 賃金',
    names: [PLACEHOLDERS.BASE_SALARY, PLACEHOLDERS.ALLOWANCES],
  },
];

/** 契約書に載せるときの表示の変換（社員台帳の元データは変えない） */
const DISPLAY_TEXTS = {
  NOT_APPLICABLE: '該当なし',
  NONE: 'なし',
  YEN_SUFFIX: '円',
  MINUTES_SUFFIX: '分',
};
const JAPANESE_DATE_FORMAT = 'yyyy年M月d日';
const THOUSANDS_SEPARATOR = ',';
const TIME_DIGITS = 2; // 09:00 のように2桁にそろえる

/** 1人分の契約書を作った結果 */
const CONTRACT_RESULTS = {
  CREATED: '新規作成',
  REUSED: '再利用',
  SKIPPED: 'スキップ',
  FAILED: '失敗',
};

// ------------------------------------------------------------
// 第4段階：契約終了まで30日以内の対象者の抽出
// ------------------------------------------------------------

/** 今日から何日後までに契約が終わる社員を抽出するか（今日＝0日目も含む） */
const CONTRACT_END_ALERT_DAYS = 30;

/**
 * 抽出結果を表示するシート（6列）。社員情報の元データにはしない。
 * 実行するたびに、見出しを残して2行目以下を作り直す。
 */
const CONTRACT_END_SHEET_NAME = '契約終了予定';
const EMPLOYEE_NUMBER_HEADER = '社員番号'; // 社員台帳の A列と同じ見出し
const REMAINING_DAYS_HEADER = '残り日数';
const CONTRACT_END_HEADERS = [
  EMPLOYEE_NUMBER_HEADER,
  QUESTIONS.NAME,
  QUESTIONS.DEPARTMENT,
  QUESTIONS.CONTRACT_END,
  REMAINING_DAYS_HEADER,
  QUESTIONS.RENEWAL,
];

/** 日数の計算に使う、1日のミリ秒 */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** 日付だけを取り出すときの形（年-月-日） */
const DATE_KEY_FORMAT = 'yyyy-MM-dd';

/** 境界テスト（testContractEndBoundaries）で日付を組み立てるときの形とタイムゾーン */
const BOUNDARY_TEST_DATE_FORMAT = 'yyyy/MM/dd HH:mm';
const BOUNDARY_TEST_TIME_ZONE = 'Asia/Tokyo';

/** 実行ログに出す「対象かどうか」の言葉 */
const TARGET_LABELS = {
  YES: '対象',
  NO: '対象外',
};

// ------------------------------------------------------------
// 第5段階：毎朝のメール通知・二重通知の防止・時間主導トリガー
// ------------------------------------------------------------

/**
 * テストモード。true の間は、テスト用の送り先（NOTIFY_TEST_RECIPIENT）にだけ送る。
 * 本番の送り先（NOTIFY_HR_RECIPIENT）は読みにも行かない。
 * false にするのは、ユーザーが本番への切り替えをはっきり指示したときだけ。
 */
const NOTIFICATION_TEST_MODE = true;

/**
 * Script Properties の名前（キー）。メールアドレスはコードに書かず、ここに入れる。
 * 値は GASエディタの「プロジェクトの設定」→「スクリプト プロパティ」で、人が入れる。
 */
const NOTIFY_PROPERTY_KEYS = {
  TEST_RECIPIENT: 'NOTIFY_TEST_RECIPIENT', // テストモードの送り先（1つだけ）
  HR_RECIPIENT: 'NOTIFY_HR_RECIPIENT', // 本番モードの送り先（テストモードでは読まない）
  TEST_BASE_DATE: 'NOTIFY_TEST_BASE_DATE', // テストモードだけ：この日（例 2027/03/01）を「今日」として扱う
  TEST_FORCE_SEND_ERROR: 'NOTIFY_TEST_FORCE_SEND_ERROR', // テストモードだけ：true なら送る直前にわざと失敗させる
};

/** テスト用の基準日の書き方（例 2027/03/01） */
const TEST_BASE_DATE_FORMAT = 'yyyy/MM/dd';
const TEST_BASE_DATE_PATTERN = /^\d{4}\/\d{2}\/\d{2}$/;

/** NOTIFY_TEST_FORCE_SEND_ERROR をこの文字にしたときだけ、わざと失敗させる（大文字・小文字は問わない） */
const FORCE_SEND_ERROR_ON = 'true';

/** 送り先として受け付ける形（メールアドレス1つだけ。カンマやセミコロンで複数並べたものは受け付けない） */
const SINGLE_EMAIL_PATTERN = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/**
 * 通知履歴シート（7列）。1回の通知で、対象者1人につき1行を足す。
 * 「通知日・社員番号・契約終了日・送信モード」が同じで、状態が「送信中」か「送信済み」の行があれば、通知済みとみなす。
 */
const NOTIFICATION_HISTORY_SHEET_NAME = '通知履歴';
const NOTIFY_DATE_HEADER = '通知日'; // 抽出の基準日（テスト用の基準日を使ったときはその日）
const NOTIFY_MODE_HEADER = '送信モード';
const NOTIFY_STATUS_HEADER = '状態';
const NOTIFY_RECORDED_AT_HEADER = '記録日時';
const NOTIFY_DETAIL_HEADER = '詳細';
const NOTIFICATION_HISTORY_HEADERS = [
  NOTIFY_DATE_HEADER,
  EMPLOYEE_NUMBER_HEADER,
  QUESTIONS.CONTRACT_END,
  NOTIFY_MODE_HEADER,
  NOTIFY_STATUS_HEADER,
  NOTIFY_RECORDED_AT_HEADER,
  NOTIFY_DETAIL_HEADER,
];

/** 通知の状態。「送信中」「送信済み」は通知済みとして数える。「送信失敗」は数えない（次の実行で送り直す） */
const NOTIFICATION_STATUS = {
  SENDING: '送信中',
  SENT: '送信済み',
  FAILED: '送信失敗',
};
const NOTIFIED_STATUSES = [NOTIFICATION_STATUS.SENDING, NOTIFICATION_STATUS.SENT];

/** 送信モードの表示 */
const NOTIFICATION_MODE_LABELS = {
  TEST: 'テスト',
  PRODUCTION: '本番',
};

/** メールの文面 */
const MAIL_TEXTS = {
  TEST_SUBJECT_PREFIX: '【テスト】',
  SUBJECT: '契約終了予定のお知らせ',
  PERSON_SUFFIX: '名',
  SEPARATOR: '----------------------------------------',
  LABEL_SEPARATOR: '：',
  DAYS_SUFFIX: '日',
  FOOTER: '※ このメールは人事DXポートフォリオの自動通知です。データはすべて架空です。',
  TEST_NOTE: '※ テストモードで送信しています（本番の人事担当者には送っていません）。',
};

/** 毎日の自動実行：このトリガーが呼ぶ関数と、実行する時間帯（8 → 8時台のどこか） */
const NOTIFICATION_TRIGGER_HANDLER = 'notifyContractsEndingSoon';
const NOTIFICATION_HOUR = 8;
const DAYS_BETWEEN_NOTIFICATIONS = 1;

/** 1回の送信に必要な、その日の残り送信数 */
const MIN_MAIL_QUOTA = 1;

// ============================================================
// 実行する関数
// ============================================================

/**
 * 第1段階のセットアップ。ここを実行する。
 * フォームと回答先スプレッドシートを用意し、つないで、回答シートの名前を整える。
 */
function setupOnboardingForm() {
  const formResult = getOrCreateForm_();
  const form = formResult.form;
  if (formResult.isNew) {
    buildFormQuestions_(form);
  }
  applyFormSettings_(form);

  const spreadsheet = getOrCreateSpreadsheet_();
  connectFormToSpreadsheet_(form, spreadsheet);
  const responseSheet = renameResponseSheet_(spreadsheet.getId(), form.getId());
  deleteInitialSheetIfSafe_(responseSheet);

  logSetupResult_(form, spreadsheet, formResult.isNew);
}

// ============================================================
// フォーム・スプレッドシートの用意（二重作成の防止）
// ============================================================

/** 保存済みのフォームがあれば再利用し、なければ新しく作る */
function getOrCreateForm_() {
  const savedId = getSavedId_(PROPERTY_KEYS.FORM_ID);
  if (savedId && isUsableFile_(savedId)) {
    return { form: FormApp.openById(savedId), isNew: false };
  }
  const form = FormApp.create(FORM_TITLE);
  saveId_(PROPERTY_KEYS.FORM_ID, form.getId());
  return { form: form, isNew: true };
}

/** 保存済みのスプレッドシートがあれば再利用し、なければ新しく作る */
function getOrCreateSpreadsheet_() {
  const savedId = getSavedId_(PROPERTY_KEYS.SPREADSHEET_ID);
  if (savedId && isUsableFile_(savedId)) {
    return SpreadsheetApp.openById(savedId);
  }
  const spreadsheet = SpreadsheetApp.create(SPREADSHEET_NAME);
  saveId_(PROPERTY_KEYS.SPREADSHEET_ID, spreadsheet.getId());
  return spreadsheet;
}

/** ファイルが存在し、ゴミ箱に入っていなければ true */
function isUsableFile_(fileId) {
  try {
    return !DriveApp.getFileById(fileId).isTrashed();
  } catch (error) {
    return false; // 削除済み・権限なしなど
  }
}

function getSavedId_(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

function saveId_(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, value);
}

// ============================================================
// フォームの設定
// ============================================================

/** メール収集・回答後の編集・1人1回答をすべて「しない」にする */
function applyFormSettings_(form) {
  form.setTitle(FORM_TITLE);
  form.setDescription(FORM_DESCRIPTION);
  form.setCollectEmail(false);
  form.setAllowResponseEdits(false);
  form.setLimitOneResponsePerUser(false);
}

// ============================================================
// 質問の作成（新しく作ったフォームにだけ実行する）
// ============================================================

/**
 * 質問をセクションごとに作り、分岐を設定する。
 *   基本情報（1〜13）
 *     → 更新する場合がある：契約更新の条件（14・15）
 *         → あり：更新上限の内容（16） → 就業条件
 *         → なし：就業条件
 *     → 更新しない：就業条件（17〜27）
 */
function buildFormQuestions_(form) {
  const renewalItem = addBasicInfoSection_(form);

  const criteriaPage = form.addPageBreakItem().setTitle(SECTION_TITLES.RENEWAL_CRITERIA);
  const limitItem = addRenewalCriteriaQuestions_(form);

  // 質問16：「更新上限＝あり」のときだけ通るセクションなので、必須にしても他の人には求められない
  const limitPage = form.addPageBreakItem().setTitle(SECTION_TITLES.RENEWAL_LIMIT);
  addRequiredText_(form, QUESTIONS.RENEWAL_LIMIT_DETAIL);

  const workPage = form.addPageBreakItem().setTitle(SECTION_TITLES.WORK_CONDITIONS);
  addWorkConditionQuestions_(form);

  setRenewalBranches_(renewalItem, criteriaPage, workPage);
  setLimitBranches_(limitItem, limitPage, workPage);
}

/** 質問1〜13。分岐元になる「契約更新」の質問を返す */
function addBasicInfoSection_(form) {
  addRequiredText_(form, QUESTIONS.INPUT_STAFF);
  addRequiredText_(form, QUESTIONS.NAME);
  addRequiredText_(form, QUESTIONS.NAME_KANA);
  addRequiredDate_(form, QUESTIONS.BIRTH_DATE);

  const emailValidation = FormApp.createTextValidation()
    .requireTextIsEmail()
    .setHelpText(VALIDATION_MESSAGES.EMAIL)
    .build();
  addRequiredText_(form, QUESTIONS.EMAIL).setValidation(emailValidation);

  addRequiredText_(form, QUESTIONS.PHONE);

  const postalValidation = FormApp.createTextValidation()
    .requireTextMatchesPattern(POSTAL_CODE_PATTERN)
    .setHelpText(VALIDATION_MESSAGES.POSTAL_CODE)
    .build();
  addRequiredText_(form, QUESTIONS.POSTAL_CODE).setValidation(postalValidation);

  addRequiredText_(form, QUESTIONS.ADDRESS);
  addRequiredText_(form, QUESTIONS.DEPARTMENT);
  form.addTextItem().setTitle(QUESTIONS.POSITION); // 任意
  addRequiredDate_(form, QUESTIONS.CONTRACT_START);
  addRequiredDate_(form, QUESTIONS.CONTRACT_END);

  // 選択肢は分岐先のセクションができてから setRenewalBranches_ で入れる
  return form.addMultipleChoiceItem().setTitle(QUESTIONS.RENEWAL).setRequired(true);
}

/**
 * 質問14・15。分岐元になる「更新上限」の質問を返す。
 * 「契約更新＝更新する場合がある」のときだけ通るセクションなので、必須にしても
 * 「更新しない」の人には求められない。
 */
function addRenewalCriteriaQuestions_(form) {
  form.addCheckboxItem()
    .setTitle(QUESTIONS.RENEWAL_CRITERIA)
    .setChoiceValues(CHOICES.RENEWAL_CRITERIA)
    .showOtherOption(true)
    .setRequired(true);

  // 選択肢は setLimitBranches_ で入れる
  return form.addMultipleChoiceItem().setTitle(QUESTIONS.RENEWAL_LIMIT).setRequired(true);
}

/** 質問17〜27 */
function addWorkConditionQuestions_(form) {
  addRequiredText_(form, QUESTIONS.WORKPLACE_INITIAL);
  addRequiredText_(form, QUESTIONS.WORKPLACE_SCOPE);
  addRequiredParagraph_(form, QUESTIONS.DUTIES_INITIAL);
  addRequiredParagraph_(form, QUESTIONS.DUTIES_SCOPE);
  form.addTimeItem().setTitle(QUESTIONS.START_TIME).setRequired(true);
  form.addTimeItem().setTitle(QUESTIONS.END_TIME).setRequired(true);
  addRequiredNonNegativeNumber_(form, QUESTIONS.BREAK_MINUTES);
  form.addMultipleChoiceItem()
    .setTitle(QUESTIONS.OVERTIME)
    .setChoiceValues(CHOICES.OVERTIME)
    .setRequired(true);
  addRequiredParagraph_(form, QUESTIONS.HOLIDAYS);
  addRequiredNonNegativeNumber_(form, QUESTIONS.BASE_SALARY);
  form.addParagraphTextItem().setTitle(QUESTIONS.ALLOWANCES); // 任意
}

/** 契約更新：「更新する場合がある」→ 更新の条件へ、「更新しない」→ 就業条件へ */
function setRenewalBranches_(renewalItem, criteriaPage, workPage) {
  renewalItem.setChoices([
    renewalItem.createChoice(CHOICES.RENEWAL_POSSIBLE, criteriaPage),
    renewalItem.createChoice(CHOICES.RENEWAL_NONE, workPage),
  ]);
}

/** 更新上限：「なし」→ 就業条件へ、「あり」→ 更新上限の内容へ */
function setLimitBranches_(limitItem, limitPage, workPage) {
  limitItem.setChoices([
    limitItem.createChoice(CHOICES.LIMIT_NONE, workPage),
    limitItem.createChoice(CHOICES.LIMIT_EXISTS, limitPage),
  ]);
}

// --- 質問を作る小さな部品 ---

function addRequiredText_(form, title) {
  return form.addTextItem().setTitle(title).setRequired(true);
}

function addRequiredParagraph_(form, title) {
  return form.addParagraphTextItem().setTitle(title).setRequired(true);
}

function addRequiredDate_(form, title) {
  return form.addDateItem().setTitle(title).setIncludesYear(true).setRequired(true);
}

function addRequiredNonNegativeNumber_(form, title) {
  const validation = FormApp.createTextValidation()
    .requireNumberGreaterThanOrEqualTo(MIN_NUMBER_VALUE)
    .setHelpText(VALIDATION_MESSAGES.NON_NEGATIVE)
    .build();
  return addRequiredText_(form, title).setValidation(validation);
}

// ============================================================
// 回答先スプレッドシートとの接続
// ============================================================

/** フォームの回答先をスプレッドシートにする（すでにつながっていれば何もしない） */
function connectFormToSpreadsheet_(form, spreadsheet) {
  if (getDestinationId_(form) === spreadsheet.getId()) {
    return;
  }
  form.setDestination(FormApp.DestinationType.SPREADSHEET, spreadsheet.getId());
}

/** 回答先が未設定なら null を返す */
function getDestinationId_(form) {
  try {
    return form.getDestinationId();
  } catch (error) {
    return null;
  }
}

/** このフォームの回答が入るシートの名前を「フォーム回答」にし、そのシートを返す */
function renameResponseSheet_(spreadsheetId, formId) {
  const sheet = findResponseSheet_(spreadsheetId, formId);
  if (!sheet) {
    throw new Error('回答シートが見つかりません。もう一度 setupOnboardingForm を実行してください。');
  }
  if (sheet.getName() === RESPONSE_SHEET_NAME) {
    return sheet;
  }
  const sameNameSheet = sheet.getParent().getSheetByName(RESPONSE_SHEET_NAME);
  if (sameNameSheet) {
    Logger.log('「' + RESPONSE_SHEET_NAME + '」という名前のシートが別にあるため、名前を変えませんでした：' + sheet.getName());
    return sheet;
  }
  sheet.setName(RESPONSE_SHEET_NAME);
  return sheet;
}

/**
 * スプレッドシートを作ったときにできる空の初期シートを消す。
 * 次の条件をすべて満たすときだけ消す。1つでも外れたら何もしない。
 *   1. シートが2枚以上ある
 *   2. このフォームにつながった「フォーム回答」シートがある
 *   3. 消す対象が「フォーム回答」シートではない
 *   4. 初期シートの名前（シート1 / Sheet1）で、フォームにつながっていない
 *   5. 完全に空である（文字・書式のある範囲・グラフ・画像が何もない）
 */
function deleteInitialSheetIfSafe_(responseSheet) {
  if (responseSheet.getName() !== RESPONSE_SHEET_NAME) {
    Logger.log('回答シートの名前が整っていないため、初期シートは消しませんでした。');
    return;
  }
  const spreadsheet = responseSheet.getParent();
  const sheets = spreadsheet.getSheets();
  if (sheets.length < 2) {
    return; // 回答シートしかない（初期シートはすでに消してある）
  }
  const initialSheet = sheets.find(function (sheet) {
    return INITIAL_SHEET_NAMES.indexOf(sheet.getName()) !== -1;
  });
  if (!initialSheet) {
    return; // すでに消してある
  }
  // 名前はシートを消す前に控えておく（消した後のシートからは何も読めない）
  const initialSheetName = initialSheet.getName();
  if (initialSheet.getSheetId() === responseSheet.getSheetId()) {
    Logger.log('「' + initialSheetName + '」は回答シートなので、消しませんでした。');
    return;
  }
  if (initialSheet.getFormUrl()) {
    Logger.log('「' + initialSheetName + '」はフォームにつながっているため、消しませんでした。');
    return;
  }
  if (!isSheetCompletelyEmpty_(initialSheet)) {
    Logger.log('「' + initialSheetName + '」は空ではないため、消しませんでした。');
    return;
  }
  spreadsheet.deleteSheet(initialSheet);
  Logger.log('空の初期シート「' + initialSheetName + '」を消しました。');
}

function isSheetCompletelyEmpty_(sheet) {
  return sheet.getLastRow() === 0 &&
    sheet.getLastColumn() === 0 &&
    sheet.getCharts().length === 0 &&
    sheet.getImages().length === 0;
}

/** 回答シートはつないだ直後には現れないことがあるので、少し待ちながら探す */
function findResponseSheet_(spreadsheetId, formId) {
  for (let attempt = 0; attempt < SHEET_WAIT_RETRIES; attempt++) {
    SpreadsheetApp.flush();
    const sheets = SpreadsheetApp.openById(spreadsheetId).getSheets();
    const found = sheets.find(function (sheet) {
      return isSheetLinkedToForm_(sheet, formId);
    });
    if (found) {
      return found;
    }
    Utilities.sleep(SHEET_WAIT_INTERVAL_MS);
  }
  return null;
}

function isSheetLinkedToForm_(sheet, formId) {
  const formUrl = sheet.getFormUrl();
  if (!formUrl) {
    return false;
  }
  try {
    return FormApp.openByUrl(formUrl).getId() === formId;
  } catch (error) {
    return false;
  }
}

// ============================================================
// 結果の表示
// ============================================================

function logSetupResult_(form, spreadsheet, isNewForm) {
  Logger.log(isNewForm ? 'フォームを新しく作りました。' : '保存済みのフォームを再利用しました。');
  Logger.log('フォーム（編集用）：' + form.getEditUrl());
  Logger.log('フォーム（回答用）：' + form.getPublishedUrl());
  Logger.log('スプレッドシート：' + spreadsheet.getUrl());
}

// ============================================================
// 第2段階：社員台帳への登録
// ============================================================

/**
 * 第2段階のセットアップ。ここを実行する。
 * 「社員台帳」「登録エラー」シートと、フォーム送信時のトリガーを用意する。
 * 何度実行しても、シートやトリガーは二重に作られない。
 */
function setupEmployeeLedger() {
  const spreadsheet = openSavedSpreadsheet_();
  // 第2段階が見るのは A〜AD の30列だけ（AE・AF は setupEmploymentContracts が足す）
  ensureSheetWithHeaders_(spreadsheet, LEDGER_SHEET_NAME, LEDGER_BASE_HEADERS);
  ensureSheetWithHeaders_(spreadsheet, ERROR_SHEET_NAME, ERROR_HEADERS);
  ensureFormSubmitTrigger_(spreadsheet);
  Logger.log('社員台帳の準備ができました：' + spreadsheet.getUrl());
}

/**
 * フォームが送信されたときに自動で動く関数（トリガーから呼ばれる）。
 * フォーム回答シートの元データは読むだけで、変更しない。
 *   1〜6：ロックの中で、チェック・発番・台帳への登録・番号の保存をしてロックを解除する
 *   7〜8：ロックの外で、契約書を作って台帳に URL と作成日時を書く（第3段階）
 * 契約書の作成に失敗しても、台帳への登録は取り消さない。
 */
function onFormSubmitToLedger(e) {
  if (!e || !e.range) {
    throw new Error('この関数はフォーム送信時に自動で動きます。手で実行しないでください。');
  }
  const responseSheet = e.range.getSheet();
  if (responseSheet.getName() !== RESPONSE_SHEET_NAME) {
    Logger.log('「' + RESPONSE_SHEET_NAME + '」以外のシートへの送信なので、何もしません：' + responseSheet.getName());
    return;
  }

  let employeeNumber = null;
  const lock = LockService.getScriptLock();
  lock.waitLock(LOCK_TIMEOUT_MS); // 待ちきれなければエラーになり、登録しない
  try {
    employeeNumber = registerResponse_(responseSheet, e.range.getRow(), e.namedValues);
  } finally {
    lock.releaseLock();
  }

  if (employeeNumber) {
    generateContractAfterRegistration_(responseSheet.getParent(), employeeNumber);
  }
}

/**
 * ロックの中で動く本体：チェック → 重複確認 → 発番 → 書き込み → 番号の保存。
 * 登録できたら社員番号（EMP-0006 など）を、登録しなかったら null を返す。
 */
function registerResponse_(responseSheet, responseRow, namedValues) {
  const spreadsheet = responseSheet.getParent();
  const ledgerSheet = getRequiredSheet_(spreadsheet, LEDGER_SHEET_NAME);
  const errorSheet = getRequiredSheet_(spreadsheet, ERROR_SHEET_NAME);
  const response = readResponse_(responseSheet, responseRow, namedValues);
  const timeZone = spreadsheet.getSpreadsheetTimeZone();

  const inputErrors = validateResponse_(response, timeZone);
  if (inputErrors.length > 0) {
    inputErrors.forEach(function (errorType) {
      recordRegistrationError_(errorSheet, response, errorType);
    });
    return null;
  }

  if (findDuplicateEmployee_(ledgerSheet, response, timeZone)) {
    recordRegistrationError_(errorSheet, response, ERROR_TYPES.DUPLICATE);
    return null;
  }

  const nextNumber = decideNextEmployeeNumber_(ledgerSheet);
  const employeeNumber = formatEmployeeNumber_(nextNumber);
  appendLedgerRow_(ledgerSheet, buildLedgerRow_(employeeNumber, response));
  SpreadsheetApp.flush(); // 書き込みを確定させてから番号を保存する
  saveId_(LAST_EMPLOYEE_NUMBER_KEY, String(nextNumber));
  Logger.log('社員台帳に登録しました：' + employeeNumber + '（フォーム回答 ' + responseRow + '行目）');
  return employeeNumber;
}

// ------------------------------------------------------------
// シートとトリガーの用意
// ------------------------------------------------------------

/** 第1段階で保存したIDからスプレッドシートを開く（新しくは作らない） */
function openSavedSpreadsheet_() {
  const spreadsheetId = getSavedId_(PROPERTY_KEYS.SPREADSHEET_ID);
  if (!spreadsheetId || !isUsableFile_(spreadsheetId)) {
    throw new Error('保存済みのスプレッドシートがありません。先に setupOnboardingForm を実行してください。');
  }
  return SpreadsheetApp.openById(spreadsheetId);
}

/** シートがなければ作って1行目に見出しを入れる。あれば見出しが合っているかだけ確かめる */
function ensureSheetWithHeaders_(spreadsheet, sheetName, headers) {
  const existing = spreadsheet.getSheetByName(sheetName);
  if (existing) {
    assertHeaders_(existing, headers);
    return existing;
  }
  const sheet = spreadsheet.insertSheet(sheetName);
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  sheet.setFrozenRows(1);
  Logger.log('「' + sheetName + '」シートを作りました。');
  return sheet;
}

function assertHeaders_(sheet, headers) {
  if (!headersMatch_(sheet, headers)) {
    throw new Error('「' + sheet.getName() + '」の見出しが想定と違います。シートの1行目を確認してください。');
  }
}

function getRequiredSheet_(spreadsheet, sheetName) {
  const sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error('「' + sheetName + '」シートがありません。先に setupEmployeeLedger を実行してください。');
  }
  return sheet;
}

/** 同じ関数・同じスプレッドシートのフォーム送信時トリガーがなければ作る */
function ensureFormSubmitTrigger_(spreadsheet) {
  const exists = ScriptApp.getProjectTriggers().some(function (trigger) {
    return trigger.getHandlerFunction() === LEDGER_TRIGGER_HANDLER &&
      trigger.getEventType() === ScriptApp.EventType.ON_FORM_SUBMIT &&
      trigger.getTriggerSourceId() === spreadsheet.getId();
  });
  if (exists) {
    Logger.log('フォーム送信時トリガーはすでにあるので、作りませんでした。');
    return;
  }
  ScriptApp.newTrigger(LEDGER_TRIGGER_HANDLER)
    .forSpreadsheet(spreadsheet)
    .onFormSubmit()
    .create();
  Logger.log('フォーム送信時トリガーを作りました。');
}

// ------------------------------------------------------------
// 回答の読み取りとチェック
// ------------------------------------------------------------

/**
 * フォーム回答の1行を「見出し → 値」の形にする（列の位置ではなく見出しの名前で探す）。
 *   values：セルの値（日付は日付として読める）
 *   displays：画面に見えている文字（時刻の比較に使う）
 * 電話番号・郵便番号は、先頭の0が消えないよう、送信された文字をそのまま使う。
 */
function readResponse_(responseSheet, responseRow, namedValues) {
  const lastColumn = responseSheet.getLastColumn();
  const headers = responseSheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  const rowRange = responseSheet.getRange(responseRow, 1, 1, lastColumn);
  const rowValues = rowRange.getValues()[0];
  const rowDisplays = rowRange.getDisplayValues()[0];

  const values = {};
  const displays = {};
  headers.forEach(function (header, index) {
    values[header] = rowValues[index];
    displays[header] = rowDisplays[index];
  });
  TEXT_QUESTIONS.forEach(function (question) {
    values[question] = getSubmittedText_(namedValues, question, displays[question]);
  });

  return {
    row: responseRow,
    timestamp: rowValues[RESPONSE_TIMESTAMP_COLUMN - 1],
    values: values,
    displays: displays,
  };
}

/** 送信された文字を取り出す（取れなければ画面の文字を使う） */
function getSubmittedText_(namedValues, question, fallback) {
  if (namedValues && namedValues[question] && namedValues[question].length > 0) {
    return String(namedValues[question][0]);
  }
  return fallback || '';
}

/** 日付と時刻の前後関係を確かめ、見つかったエラー種別の一覧を返す（なければ空） */
function validateResponse_(response, timeZone) {
  const errors = [];
  if (!isContractPeriodValid_(response, timeZone)) {
    errors.push(ERROR_TYPES.CONTRACT_PERIOD);
  }
  if (!isWorkTimeValid_(response)) {
    errors.push(ERROR_TYPES.WORK_TIME);
  }
  return errors;
}

/** 契約終了日が契約開始日と同じか後なら true（年月日だけで比べる） */
function isContractPeriodValid_(response, timeZone) {
  const start = toDateKey_(response.values[QUESTIONS.CONTRACT_START], timeZone);
  const end = toDateKey_(response.values[QUESTIONS.CONTRACT_END], timeZone);
  return start !== '' && end !== '' && end >= start;
}

/** 終業時刻が始業時刻より後なら true（日をまたぐ勤務は対象外） */
function isWorkTimeValid_(response) {
  const start = toMinutes_(response.displays[QUESTIONS.START_TIME]);
  const end = toMinutes_(response.displays[QUESTIONS.END_TIME]);
  return start !== null && end !== null && end > start;
}

/** 日付を「20261001」のような年月日の文字にする。大小比較ができる形 */
function toDateKey_(value, timeZone) {
  if (!(value instanceof Date) || isNaN(value.getTime())) {
    return '';
  }
  return Utilities.formatDate(value, timeZone, 'yyyyMMdd');
}

/**
 * 画面に見えている時刻を「0時から何分か」にする。読めなければ null（0 にはしない）。
 *   24時間表記：09:00 / 9:00 / 18:00:00
 *   12時間表記：9:00:00 AM / 6:00:00 PM（am/pm の大文字・小文字は問わない）
 *               12:00 AM → 0分、12:00 PM → 720分
 */
function toMinutes_(timeText) {
  const match = TIME_TEXT_PATTERN.exec(String(timeText).trim());
  if (!match) {
    return null;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = match[3] === undefined ? 0 : Number(match[3]);
  const period = match[4] === undefined ? '' : match[4].toUpperCase();
  if (minute > MAX_MINUTE || second > MAX_SECOND) {
    return null;
  }
  const hour24 = toHour24_(hour, period);
  return hour24 === null ? null : hour24 * MINUTES_PER_HOUR + minute;
}

/** 12時間表記の時を24時間表記に直す。ありえない時なら null */
function toHour24_(hour, period) {
  if (period === '') {
    return hour <= MAX_HOUR_24 ? hour : null;
  }
  if (hour < 1 || hour > HOURS_PER_HALF_DAY) {
    return null;
  }
  const hourInHalfDay = hour % HOURS_PER_HALF_DAY; // 12時は0時として数える
  return period === 'PM' ? hourInHalfDay + HOURS_PER_HALF_DAY : hourInHalfDay;
}

// ------------------------------------------------------------
// 重複の確認
// ------------------------------------------------------------

/** 社員台帳に、同じメールアドレスと生年月日の人がいれば true */
function findDuplicateEmployee_(ledgerSheet, response, timeZone) {
  const lastRow = ledgerSheet.getLastRow();
  if (lastRow < 2) {
    return false; // 見出しだけ
  }
  const emailColumn = LEDGER_BASE_HEADERS.indexOf(QUESTIONS.EMAIL) + 1;
  const birthColumn = LEDGER_BASE_HEADERS.indexOf(QUESTIONS.BIRTH_DATE) + 1;
  const emails = ledgerSheet.getRange(2, emailColumn, lastRow - 1, 1).getValues();
  const births = ledgerSheet.getRange(2, birthColumn, lastRow - 1, 1).getValues();

  const targetEmail = normalizeEmail_(response.values[QUESTIONS.EMAIL]);
  const targetBirth = toDateKey_(response.values[QUESTIONS.BIRTH_DATE], timeZone);
  return emails.some(function (emailRow, index) {
    return normalizeEmail_(emailRow[0]) === targetEmail &&
      toDateKey_(births[index][0], timeZone) === targetBirth;
  });
}

/** 前後の空白を取り、小文字にそろえる */
function normalizeEmail_(email) {
  return String(email).trim().toLowerCase();
}

// ------------------------------------------------------------
// 社員番号
// ------------------------------------------------------------

/**
 * 次の社員番号（数字）を決める。
 * 保存してある最後の番号と、台帳に実際にある最大の番号を比べ、大きいほうの次を使う。
 * ロックの中で呼ぶので、同時に動いても同じ番号にはならない。
 */
function decideNextEmployeeNumber_(ledgerSheet) {
  const savedNumber = Number(getSavedId_(LAST_EMPLOYEE_NUMBER_KEY)) || 0;
  const ledgerMax = findMaxEmployeeNumber_(ledgerSheet);
  return Math.max(savedNumber, ledgerMax) + 1;
}

/** 台帳の社員番号の列から、一番大きい番号を探す（なければ 0） */
function findMaxEmployeeNumber_(ledgerSheet) {
  const lastRow = ledgerSheet.getLastRow();
  if (lastRow < 2) {
    return 0;
  }
  const numbers = ledgerSheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
  return numbers.reduce(function (max, row) {
    const match = EMPLOYEE_NUMBER_PATTERN.exec(String(row[0]).trim());
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
}

/** 1 → EMP-0001 */
function formatEmployeeNumber_(number) {
  return EMPLOYEE_NUMBER_PREFIX + String(number).padStart(EMPLOYEE_NUMBER_DIGITS, '0');
}

// ------------------------------------------------------------
// 社員台帳への書き込み
// ------------------------------------------------------------

/** 台帳の1行（A〜ADの30列）を組み立てる。AE・AF は契約書を作ったあとで書く */
function buildLedgerRow_(employeeNumber, response) {
  const questionValues = LEDGER_QUESTION_HEADERS.map(function (question) {
    const value = response.values[question];
    return value === undefined ? '' : value;
  });
  return [employeeNumber, new Date(), response.timestamp].concat(questionValues);
}

/** 台帳の最後に1行書く。先に表示形式を決めてから値を入れる（先頭の0を守るため） */
function appendLedgerRow_(ledgerSheet, rowValues) {
  const range = ledgerSheet.getRange(ledgerSheet.getLastRow() + 1, 1, 1, rowValues.length);
  range.setNumberFormats([buildLedgerNumberFormats_()]);
  range.setValues([rowValues]);
}

/** 台帳の各列（A〜AD）の表示形式（'' は自動のまま） */
function buildLedgerNumberFormats_() {
  return LEDGER_BASE_HEADERS.map(function (header) {
    if (header === '台帳登録日時' || header === 'フォーム回答日時') {
      return NUMBER_FORMATS.DATE_TIME;
    }
    if (header === '社員番号' || TEXT_QUESTIONS.indexOf(header) !== -1) {
      return NUMBER_FORMATS.TEXT;
    }
    if (DATE_QUESTIONS.indexOf(header) !== -1) {
      return NUMBER_FORMATS.DATE;
    }
    if (TIME_QUESTIONS.indexOf(header) !== -1) {
      return NUMBER_FORMATS.TIME;
    }
    return '';
  });
}

// ------------------------------------------------------------
// 登録エラーの記録
// ------------------------------------------------------------

/**
 * 登録できなかった理由を「登録エラー」シートと実行ログに残す。
 * 同じフォーム回答行・同じエラー種別の記録がすでにあれば、シートには足さない。
 */
function recordRegistrationError_(errorSheet, response, errorType) {
  Logger.log('社員台帳に登録しませんでした（フォーム回答 ' + response.row + '行目）：' +
    errorType.type + '：' + errorType.detail);

  if (hasErrorRecord_(errorSheet, response.row, errorType.type)) {
    Logger.log('同じ記録が「' + ERROR_SHEET_NAME + '」にあるので、追加しませんでした。');
    return;
  }
  const rowValues = [
    new Date(),
    response.row,
    response.values[QUESTIONS.NAME],
    response.values[QUESTIONS.EMAIL],
    response.values[QUESTIONS.BIRTH_DATE],
    errorType.type,
    errorType.detail,
  ];
  const range = errorSheet.getRange(errorSheet.getLastRow() + 1, 1, 1, rowValues.length);
  range.setNumberFormats([[NUMBER_FORMATS.DATE_TIME, NUMBER_FORMATS.INTEGER, '', '', NUMBER_FORMATS.DATE, '', '']]);
  range.setValues([rowValues]);
}

/** 登録エラーシートに、同じフォーム回答行・同じエラー種別の記録があれば true */
function hasErrorRecord_(errorSheet, responseRow, typeName) {
  const lastRow = errorSheet.getLastRow();
  if (lastRow < 2) {
    return false;
  }
  const rows = errorSheet.getRange(2, ERROR_ROW_COLUMN, lastRow - 1, 1).getValues();
  const types = errorSheet.getRange(2, ERROR_TYPE_COLUMN, lastRow - 1, 1).getValues();
  return rows.some(function (row, index) {
    return Number(row[0]) === responseRow && types[index][0] === typeName;
  });
}

// ============================================================
// 第3段階：雇用契約書（下書き）の自動作成
// ============================================================

/**
 * 第3段階のセットアップ。ここを実行する。
 *   1. 社員台帳に AE「契約書URL」・AF「契約書作成日時」の見出しを足す（A〜AD と2行目以下は変えない）
 *   2. 「契約書エラー」シートを用意する
 *   3. 保存フォルダとテンプレートを用意する（初回だけ作り、IDを保存する）
 *   4. テンプレートに26個のプレースホルダーがすべてあるか確かめる（足りなければ止める）
 *   5. 契約書を自動で作る最初の社員番号を決めて保存する（初回だけ）
 * 既存の社員の契約書は作らない。何度実行しても、シート・フォルダ・テンプレートは二重に作られない。
 */
function setupEmploymentContracts() {
  const spreadsheet = openSavedSpreadsheet_();
  const ledgerSheet = getRequiredSheet_(spreadsheet, LEDGER_SHEET_NAME);
  migrateLedgerToContractColumns_(ledgerSheet);
  ensureSheetWithHeaders_(spreadsheet, CONTRACT_ERROR_SHEET_NAME, CONTRACT_ERROR_HEADERS);

  const folder = getOrCreateContractFolder_();
  const templateFile = getOrCreateContractTemplate_(folder);
  const missing = findMissingPlaceholders_(DocumentApp.openById(templateFile.getId()));
  if (missing.length > 0) {
    throw new Error('テンプレートに次のプレースホルダーがありません：' + missing.join('、') +
      '。テンプレートを直してから、もう一度実行してください。');
  }

  // 開始番号は最後に保存する。これが保存されていることが「セットアップ完了」の目印になる
  const startNumber = ensureContractStartNumber_(ledgerSheet);
  Logger.log('契約書の準備ができました。');
  Logger.log('保存フォルダ：' + folder.getUrl());
  Logger.log('テンプレート：' + templateFile.getUrl());
  Logger.log('契約書を自動で作るのは ' + formatEmployeeNumber_(startNumber) + ' からです。');
}

/**
 * 復旧用。手で実行する。
 * 契約書URL（AE）が空欄で、社員番号が開始番号以上の社員だけ、契約書を作る（同じ名前の完成版があれば再利用する）。
 * 開始番号より前の社員（第3段階より前に登録した社員）は対象にしない。
 * フォームが送信されていないときに実行すること（同じ人の契約書を同時に作らないため）。
 */
function generateMissingEmploymentContracts() {
  if (!isContractSetupComplete_()) {
    throw new Error('契約書のセットアップが済んでいません。先に setupEmploymentContracts を実行してください。');
  }
  const spreadsheet = openSavedSpreadsheet_();
  const ledgerSheet = getRequiredSheet_(spreadsheet, LEDGER_SHEET_NAME);
  const startNumber = getContractStartNumber_();
  const targets = findEmployeesWithoutContract_(ledgerSheet, startNumber);
  Logger.log('対象：' + targets.length + '人（' + formatEmployeeNumber_(startNumber) +
    ' 以上で、契約書URLが空欄の社員）');

  const counts = {};
  Object.keys(CONTRACT_RESULTS).forEach(function (key) {
    counts[CONTRACT_RESULTS[key]] = 0;
  });
  targets.forEach(function (employeeNumber) {
    const result = generateContractForEmployee_(spreadsheet, employeeNumber);
    counts[result] += 1;
  });
  Logger.log('結果：' + Object.keys(counts).map(function (name) {
    return name + ' ' + counts[name] + '件';
  }).join('／'));
}

// ------------------------------------------------------------
// セットアップ済みかどうか・開始番号
// ------------------------------------------------------------

/** setupEmploymentContracts が最後まで済んでいれば true（フォルダ・テンプレート・開始番号がそろっている） */
function isContractSetupComplete_() {
  const keys = [
    CONTRACT_PROPERTY_KEYS.FOLDER_ID,
    CONTRACT_PROPERTY_KEYS.TEMPLATE_ID,
    CONTRACT_PROPERTY_KEYS.START_NUMBER,
  ];
  return keys.every(function (key) {
    return Boolean(getSavedId_(key));
  });
}

function getContractStartNumber_() {
  return Number(getSavedId_(CONTRACT_PROPERTY_KEYS.START_NUMBER));
}

/**
 * 契約書を自動で作る最初の社員番号を決めて保存する。
 * 初回だけ「台帳にある最大の社員番号 + 1」を保存する。2回目以降は保存済みの値を変えずに返す。
 * 発番と同じロックを使い、フォームの登録と同時に数えないようにする。
 */
function ensureContractStartNumber_(ledgerSheet) {
  const saved = getSavedId_(CONTRACT_PROPERTY_KEYS.START_NUMBER);
  if (saved) {
    Logger.log('開始番号はすでに保存されているので、変えませんでした：' + formatEmployeeNumber_(Number(saved)));
    return Number(saved);
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(LOCK_TIMEOUT_MS);
  try {
    const startNumber = findMaxEmployeeNumber_(ledgerSheet) + 1;
    saveId_(CONTRACT_PROPERTY_KEYS.START_NUMBER, String(startNumber));
    Logger.log('開始番号を保存しました：' + formatEmployeeNumber_(startNumber));
    return startNumber;
  } finally {
    lock.releaseLock();
  }
}

/** 社員番号が開始番号以上なら true（第3段階より前の社員は false） */
function isContractTarget_(employeeNumber) {
  const number = parseEmployeeNumber_(employeeNumber);
  return number !== null && number >= getContractStartNumber_();
}

/** EMP-0006 → 6。形が違えば null */
function parseEmployeeNumber_(text) {
  const match = EMPLOYEE_NUMBER_PATTERN.exec(String(text).trim());
  return match ? Number(match[1]) : null;
}

// ------------------------------------------------------------
// 社員台帳：30列 → 32列
// ------------------------------------------------------------

/**
 * 社員台帳を30列から32列にする。A〜AD と2行目以下の値は変えない。
 *   ・A〜AD の見出しが第2段階と違えば、何もせずに止める
 *   ・AE1・AF1 がすでに正しい見出しなら、何もしない（再実行しても大丈夫）
 *   ・AE1・AF1 が空欄で、AE・AF 列の2行目以下も空欄なら、見出しを書く
 *   ・それ以外（別の文字が入っている）は、上書きせずに止める
 */
function migrateLedgerToContractColumns_(ledgerSheet) {
  assertHeaders_(ledgerSheet, LEDGER_BASE_HEADERS);
  ensureColumnCount_(ledgerSheet, LEDGER_HEADERS.length);

  const firstContractColumn = LEDGER_BASE_HEADERS.length + 1;
  const headerRange = ledgerSheet.getRange(HEADER_ROW, firstContractColumn, 1, LEDGER_CONTRACT_HEADERS.length);
  const current = headerRange.getDisplayValues()[0];
  const isAlreadyMigrated = LEDGER_CONTRACT_HEADERS.every(function (header, index) {
    return current[index] === header;
  });
  if (isAlreadyMigrated) {
    Logger.log('社員台帳にはすでに契約書の列があるので、変えませんでした。');
    return;
  }

  const isHeaderBlank = current.every(function (value) {
    return value === '';
  });
  if (!isHeaderBlank || !isColumnDataBlank_(ledgerSheet, firstContractColumn, LEDGER_CONTRACT_HEADERS.length)) {
    throw new Error('社員台帳の「' + LEDGER_CONTRACT_HEADERS.join('」「') + '」を入れる列（AE・AF）に、' +
      '想定と違う値が入っています。上書きしないよう、何もせずに止めました。');
  }
  headerRange.setValues([LEDGER_CONTRACT_HEADERS]).setFontWeight('bold');
  Logger.log('社員台帳に「' + LEDGER_CONTRACT_HEADERS.join('」「') + '」の列を足しました（既存の行は空欄のままです）。');
}

/** シートの列が足りなければ、右端に空の列を足す（既存のセルは動かない） */
function ensureColumnCount_(sheet, columnCount) {
  const maxColumns = sheet.getMaxColumns();
  if (maxColumns < columnCount) {
    sheet.insertColumnsAfter(maxColumns, columnCount - maxColumns);
  }
}

/** 指定した列の2行目以下がすべて空欄なら true */
function isColumnDataBlank_(sheet, firstColumn, columnCount) {
  const lastRow = sheet.getLastRow();
  if (lastRow < FIRST_DATA_ROW) {
    return true;
  }
  const values = sheet.getRange(FIRST_DATA_ROW, firstColumn, lastRow - FIRST_DATA_ROW + 1, columnCount)
    .getDisplayValues();
  return values.every(function (row) {
    return row.every(function (value) {
      return value === '';
    });
  });
}

/** 社員台帳が32列になっていなければエラー（setupEmploymentContracts の実行を促す） */
function assertLedgerHasContractColumns_(ledgerSheet) {
  const hasColumns = ledgerSheet.getMaxColumns() >= LEDGER_HEADERS.length &&
    headersMatch_(ledgerSheet, LEDGER_HEADERS);
  if (!hasColumns) {
    throw new Error('社員台帳に「' + LEDGER_CONTRACT_HEADERS.join('」「') +
      '」の列がありません。先に setupEmploymentContracts を実行してください。');
  }
}

function headersMatch_(sheet, headers) {
  const current = sheet.getRange(HEADER_ROW, 1, 1, headers.length).getDisplayValues()[0];
  return headers.every(function (header, index) {
    return current[index] === header;
  });
}

// ------------------------------------------------------------
// 保存フォルダとテンプレート
// ------------------------------------------------------------

/** 保存済みのフォルダがあれば再利用し、なければ新しく作る */
function getOrCreateContractFolder_() {
  const savedId = getSavedId_(CONTRACT_PROPERTY_KEYS.FOLDER_ID);
  if (savedId && isUsableFolder_(savedId)) {
    Logger.log('保存済みのフォルダを再利用しました。');
    return DriveApp.getFolderById(savedId);
  }
  const folder = DriveApp.createFolder(CONTRACT_FOLDER_NAME);
  saveId_(CONTRACT_PROPERTY_KEYS.FOLDER_ID, folder.getId());
  Logger.log('フォルダ「' + CONTRACT_FOLDER_NAME + '」を作りました。');
  return folder;
}

/** 契約書を作るときに使う。フォルダがなければエラー（新しくは作らない） */
function openContractFolder_() {
  const savedId = getSavedId_(CONTRACT_PROPERTY_KEYS.FOLDER_ID);
  if (!savedId || !isUsableFolder_(savedId)) {
    throw new Error('保存フォルダ「' + CONTRACT_FOLDER_NAME + '」が見つかりません（ゴミ箱に入っているかもしれません）。' +
      'setupEmploymentContracts を実行してください。');
  }
  return DriveApp.getFolderById(savedId);
}

/** フォルダが存在し、ゴミ箱に入っていなければ true */
function isUsableFolder_(folderId) {
  try {
    return !DriveApp.getFolderById(folderId).isTrashed();
  } catch (error) {
    return false; // 削除済み・権限なしなど
  }
}

/**
 * 保存済みのテンプレートがあれば再利用し、なければ新しく作って保存フォルダに入れる。
 * 再利用するときは中身を書き換えない（手で整えた見た目を消さないため）。
 */
function getOrCreateContractTemplate_(folder) {
  const savedId = getSavedId_(CONTRACT_PROPERTY_KEYS.TEMPLATE_ID);
  if (savedId && isUsableFile_(savedId)) {
    Logger.log('保存済みのテンプレートを再利用しました（中身は変えていません）。');
    return DriveApp.getFileById(savedId);
  }
  const document = DocumentApp.create(CONTRACT_TEMPLATE_NAME);
  // 途中で止まっても次の実行で二重に作らないよう、IDは作った直後に保存する
  saveId_(CONTRACT_PROPERTY_KEYS.TEMPLATE_ID, document.getId());
  const file = DriveApp.getFileById(document.getId());
  file.moveTo(folder);
  buildContractTemplateBody_(document);
  document.saveAndClose();
  Logger.log('テンプレート「' + CONTRACT_TEMPLATE_NAME + '」を作りました。');
  return file;
}

/** 契約書を作るときに使う。テンプレートがなければエラー（新しくは作らない） */
function openContractTemplateFile_() {
  const savedId = getSavedId_(CONTRACT_PROPERTY_KEYS.TEMPLATE_ID);
  if (!savedId || !isUsableFile_(savedId)) {
    throw new Error('テンプレート「' + CONTRACT_TEMPLATE_NAME + '」が見つかりません（ゴミ箱に入っているかもしれません）。' +
      'setupEmploymentContracts を実行してください。');
  }
  return DriveApp.getFileById(savedId);
}

/** テンプレートの本文：タイトル → 注意書き → 節ごとの表（項目名 | {{プレースホルダー}}） → 作成日 */
function buildContractTemplateBody_(document) {
  const body = document.getBody();
  body.clear();
  body.appendParagraph(CONTRACT_TEMPLATE_TEXT.TITLE)
    .setHeading(DocumentApp.ParagraphHeading.TITLE)
    .setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  body.appendParagraph(CONTRACT_TEMPLATE_TEXT.NOTICE).editAsText().setItalic(true);
  body.appendParagraph(CONTRACT_TEMPLATE_TEXT.INTRO);

  CONTRACT_TEMPLATE_SECTIONS.forEach(function (section) {
    body.appendParagraph(section.heading).setHeading(DocumentApp.ParagraphHeading.HEADING2);
    const rows = section.names.map(function (name) {
      return [name, toPlaceholder_(name)];
    });
    body.appendTable(rows);
  });

  body.appendParagraph(CONTRACT_TEMPLATE_TEXT.CREATED_DATE_LABEL + toPlaceholder_(PLACEHOLDERS.CREATED_DATE));
}

// ------------------------------------------------------------
// プレースホルダー
// ------------------------------------------------------------

/** 会社名 → {{会社名}} */
function toPlaceholder_(name) {
  return PLACEHOLDER_OPEN + name + PLACEHOLDER_CLOSE;
}

/** 26個のプレースホルダーの名前を一覧にする */
function listPlaceholderNames_() {
  return Object.keys(PLACEHOLDERS).map(function (key) {
    return PLACEHOLDERS[key];
  });
}

/** 文書（本文・ヘッダー・フッター）にないプレースホルダーの名前を返す（すべてあれば空） */
function findMissingPlaceholders_(document) {
  const text = getDocumentText_(document);
  return listPlaceholderNames_().filter(function (name) {
    return text.indexOf(toPlaceholder_(name)) === -1;
  });
}

/** 差し込み後の文書に残っている {{…}} を返す（なければ空） */
function findLeftoverPlaceholders_(document) {
  return getDocumentText_(document).match(LEFTOVER_PLACEHOLDER_PATTERN) || [];
}

function getDocumentText_(document) {
  return getDocumentSections_(document).map(function (section) {
    return section.getText();
  }).join('\n');
}

/** 本文・ヘッダー・フッターのうち、存在するものを返す */
function getDocumentSections_(document) {
  return [document.getBody(), document.getHeader(), document.getFooter()].filter(Boolean);
}

/**
 * 文字を、正規表現で「その文字そのもの」として探せる形にする。
 * Googleドキュメントの検索（findText）は検索文字を正規表現として扱うため、
 * { } ( ) . * + ? ^ $ | [ ] \ の前に \ を付けて、特別な意味を消す。
 * 全角の（ ）や ・ は正規表現の記号ではないので、そのままで一致する。
 */
function escapeForRegExp_(text) {
  return text.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}

/** 文書のすべての場所で、プレースホルダーを値に置き換える */
function replacePlaceholders_(document, replacements) {
  getDocumentSections_(document).forEach(function (section) {
    Object.keys(replacements).forEach(function (name) {
      replacePlaceholderInSection_(section, toPlaceholder_(name), replacements[name]);
    });
  });
}

/**
 * 1つのプレースホルダーを値に置き換える。
 * 探すとき：escapeForRegExp_ で記号を普通の文字にしてから探す。
 * 入れるとき：値の中の $ や \ が特別な意味を持たないよう、いったん消してから文字のまま入れる。
 */
function replacePlaceholderInSection_(section, placeholder, value) {
  if (value.indexOf(placeholder) !== -1) {
    // 値の中に同じ目印があると、置き換えが終わらなくなる
    throw new Error('差し込む値の中に「' + placeholder + '」と同じ文字が入っています。');
  }
  const pattern = escapeForRegExp_(placeholder);
  let found = section.findText(pattern);
  while (found) {
    const text = found.getElement().asText();
    const start = found.getStartOffset();
    text.deleteText(start, found.getEndOffsetInclusive());
    if (value !== '') {
      text.insertText(start, value);
    }
    found = section.findText(pattern); // 置き換えた所は消えているので、先頭から探し直す
  }
}

// ------------------------------------------------------------
// 差し込む値（表示の変換）
// ------------------------------------------------------------

/**
 * 社員台帳の1人分から、26個のプレースホルダーに入れる値を作る。
 * 表示の変換はここだけで行い、社員台帳の元データは変えない。
 *   契約更新＝更新しない → 更新判断基準・更新上限・更新上限の内容は「該当なし」
 *   更新上限＝なし       → 更新上限の内容は「該当なし」
 *   役職・諸手当が空欄   → 「なし」
 *   基本給 250000        → 「250,000円」
 */
function buildContractReplacements_(employee, createdAt, timeZone) {
  const values = employee.values;
  const displays = employee.displays;
  const isRenewalNone = toText_(values[QUESTIONS.RENEWAL]) === CHOICES.RENEWAL_NONE;
  const isLimitNone = isRenewalNone || toText_(values[QUESTIONS.RENEWAL_LIMIT]) === CHOICES.LIMIT_NONE;

  const replacements = {};
  replacements[PLACEHOLDERS.COMPANY_NAME] = COMPANY_INFO.NAME;
  replacements[PLACEHOLDERS.COMPANY_ADDRESS] = COMPANY_INFO.ADDRESS;
  replacements[PLACEHOLDERS.COMPANY_REPRESENTATIVE] = COMPANY_INFO.REPRESENTATIVE;

  replacements[PLACEHOLDERS.EMPLOYEE_NUMBER] = employee.employeeNumber;
  replacements[PLACEHOLDERS.NAME] = toText_(values[QUESTIONS.NAME]);
  replacements[PLACEHOLDERS.ADDRESS] = toText_(values[QUESTIONS.ADDRESS]);
  replacements[PLACEHOLDERS.DEPARTMENT] = toText_(values[QUESTIONS.DEPARTMENT]);
  replacements[PLACEHOLDERS.POSITION] = textOrDefault_(values[QUESTIONS.POSITION], DISPLAY_TEXTS.NONE);

  replacements[PLACEHOLDERS.CONTRACT_START] =
    formatJapaneseDate_(values[QUESTIONS.CONTRACT_START], timeZone, QUESTIONS.CONTRACT_START);
  replacements[PLACEHOLDERS.CONTRACT_END] =
    formatJapaneseDate_(values[QUESTIONS.CONTRACT_END], timeZone, QUESTIONS.CONTRACT_END);
  replacements[PLACEHOLDERS.RENEWAL] = toText_(values[QUESTIONS.RENEWAL]);
  replacements[PLACEHOLDERS.RENEWAL_CRITERIA] =
    isRenewalNone ? DISPLAY_TEXTS.NOT_APPLICABLE : toText_(values[QUESTIONS.RENEWAL_CRITERIA]);
  replacements[PLACEHOLDERS.RENEWAL_LIMIT] =
    isRenewalNone ? DISPLAY_TEXTS.NOT_APPLICABLE : toText_(values[QUESTIONS.RENEWAL_LIMIT]);
  replacements[PLACEHOLDERS.RENEWAL_LIMIT_DETAIL] =
    isLimitNone ? DISPLAY_TEXTS.NOT_APPLICABLE : toText_(values[QUESTIONS.RENEWAL_LIMIT_DETAIL]);

  replacements[PLACEHOLDERS.WORKPLACE_INITIAL] = toText_(values[QUESTIONS.WORKPLACE_INITIAL]);
  replacements[PLACEHOLDERS.WORKPLACE_SCOPE] = toText_(values[QUESTIONS.WORKPLACE_SCOPE]);
  replacements[PLACEHOLDERS.DUTIES_INITIAL] = toText_(values[QUESTIONS.DUTIES_INITIAL]);
  replacements[PLACEHOLDERS.DUTIES_SCOPE] = toText_(values[QUESTIONS.DUTIES_SCOPE]);

  replacements[PLACEHOLDERS.START_TIME] = formatContractTime_(displays[QUESTIONS.START_TIME], QUESTIONS.START_TIME);
  replacements[PLACEHOLDERS.END_TIME] = formatContractTime_(displays[QUESTIONS.END_TIME], QUESTIONS.END_TIME);
  replacements[PLACEHOLDERS.BREAK_TIME] = toText_(values[QUESTIONS.BREAK_MINUTES]) + DISPLAY_TEXTS.MINUTES_SUFFIX;
  replacements[PLACEHOLDERS.OVERTIME] = toText_(values[QUESTIONS.OVERTIME]);
  replacements[PLACEHOLDERS.HOLIDAYS] = toText_(values[QUESTIONS.HOLIDAYS]);

  replacements[PLACEHOLDERS.BASE_SALARY] = formatYen_(values[QUESTIONS.BASE_SALARY]);
  replacements[PLACEHOLDERS.ALLOWANCES] = textOrDefault_(values[QUESTIONS.ALLOWANCES], DISPLAY_TEXTS.NONE);

  replacements[PLACEHOLDERS.CREATED_DATE] = formatJapaneseDate_(createdAt, timeZone, PLACEHOLDERS.CREATED_DATE);
  return replacements;
}

/** 値を前後の空白を取った文字にする（空なら ''） */
function toText_(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

/** 空欄なら代わりの文字にする */
function textOrDefault_(value, fallback) {
  const text = toText_(value);
  return text === '' ? fallback : text;
}

/** 日付 → 2026年10月1日。日付として読めなければエラー */
function formatJapaneseDate_(value, timeZone, label) {
  if (!(value instanceof Date) || isNaN(value.getTime())) {
    throw new Error(label + 'が日付として読めません：' + toText_(value));
  }
  return Utilities.formatDate(value, timeZone, JAPANESE_DATE_FORMAT);
}

/** 画面に見えている時刻 → 09:00。読めなければエラー（第2段階の toMinutes_ を使う） */
function formatContractTime_(timeText, label) {
  const minutes = toMinutes_(timeText);
  if (minutes === null) {
    throw new Error(label + 'が時刻として読めません：' + toText_(timeText));
  }
  const hour = Math.floor(minutes / MINUTES_PER_HOUR);
  const minute = minutes % MINUTES_PER_HOUR;
  return String(hour).padStart(TIME_DIGITS, '0') + ':' + String(minute).padStart(TIME_DIGITS, '0');
}

/** 250000 → 250,000円。数値として読めなければエラー */
function formatYen_(value) {
  const text = toText_(value);
  const number = Number(text);
  if (text === '' || isNaN(number)) {
    throw new Error(QUESTIONS.BASE_SALARY + 'が数値として読めません：' + text);
  }
  const parts = String(number).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, THOUSANDS_SEPARATOR); // 右から3桁ごとに区切る
  return parts.join('.') + DISPLAY_TEXTS.YEN_SUFFIX;
}

// ------------------------------------------------------------
// 契約書を1人分つくる
// ------------------------------------------------------------

/**
 * 台帳への登録のあと（ロックの外）で呼ぶ。
 * 第3段階のセットアップが済んでいなければ、契約書は作らずにログだけ残す。台帳への登録には影響しない。
 */
function generateContractAfterRegistration_(spreadsheet, employeeNumber) {
  if (!isContractSetupComplete_()) {
    Logger.log('契約書のセットアップ（setupEmploymentContracts）が済んでいないため、' +
      employeeNumber + ' の契約書は作りませんでした。');
    return;
  }
  generateContractForEmployee_(spreadsheet, employeeNumber);
}

/**
 * 1人分の契約書を用意して、台帳の AE・AF に URL と作成日時を書く。結果（CONTRACT_RESULTS）を返す。
 * 失敗しても例外は外に出さず、実行ログと「契約書エラー」シートに残す。台帳の登録は取り消さない。
 */
function generateContractForEmployee_(spreadsheet, employeeNumber) {
  // エラーの記録に使う情報。処理が進むにつれて埋まっていく
  const context = { employeeNumber: employeeNumber, name: '', fileName: '', fileUrl: '' };
  try {
    return createOrReuseContract_(spreadsheet, context);
  } catch (error) {
    recordContractError_(spreadsheet, context, getErrorMessage_(error));
    return CONTRACT_RESULTS.FAILED;
  }
}

/**
 * 二重に作らないための確認をしてから、契約書を作るか再利用する。
 *   1. 開始番号より前の社員なら何もしない
 *   2. AE（契約書URL）に値があれば何もしない
 *   3. 保存フォルダに同じ名前の完成版が2件以上 → 選ばずにエラー
 *   4. 1件だけ → その文書を再利用して URL を保存する
 *   5. 0件 → 新しく作って URL を保存する
 */
function createOrReuseContract_(spreadsheet, context) {
  const ledgerSheet = getRequiredSheet_(spreadsheet, LEDGER_SHEET_NAME);
  const employee = readLedgerEmployee_(ledgerSheet, context.employeeNumber);
  context.name = toText_(employee.values[QUESTIONS.NAME]);

  if (!isContractTarget_(context.employeeNumber)) {
    Logger.log(context.employeeNumber + ' は開始番号より前の社員なので、契約書は作りませんでした。');
    return CONTRACT_RESULTS.SKIPPED;
  }
  if (toText_(employee.displays[CONTRACT_URL_HEADER]) !== '') {
    Logger.log(context.employeeNumber + ' はすでに契約書URLがあるので、作りませんでした。');
    return CONTRACT_RESULTS.SKIPPED;
  }

  const folder = openContractFolder_();
  const fileName = buildContractFileName_(context.employeeNumber, context.name);
  context.fileName = fileName;

  const sameNameFiles = findDocumentsByName_(folder, fileName);
  if (sameNameFiles.length > 1) {
    throw new Error('保存フォルダに同じ名前の完成版が ' + sameNameFiles.length +
      ' 件あります。どれを使うか決められないため、作りませんでした。');
  }
  if (sameNameFiles.length === 1) {
    const existingFile = sameNameFiles[0];
    context.fileUrl = existingFile.getUrl();
    saveContractInfoToLedger_(ledgerSheet, context.employeeNumber, existingFile.getUrl(), existingFile.getDateCreated());
    Logger.log('同じ名前の契約書があったので、再利用しました：' + fileName);
    return CONTRACT_RESULTS.REUSED;
  }

  // 値の変換で失敗したときに仮のファイルを残さないよう、コピーより先に値を作る
  const createdAt = new Date();
  const replacements = buildContractReplacements_(employee, createdAt, spreadsheet.getSpreadsheetTimeZone());
  const contractFile = createContractDocument_(folder, fileName, replacements, context);
  saveContractInfoToLedger_(ledgerSheet, context.employeeNumber, contractFile.getUrl(), createdAt);
  Logger.log('契約書を作りました：' + fileName + ' ' + contractFile.getUrl());
  return CONTRACT_RESULTS.CREATED;
}

/** 雇用契約書_下書き_EMP-0006_架空 十二郎 */
function buildContractFileName_(employeeNumber, name) {
  if (name === '') {
    throw new Error('氏名が空欄なので、ファイル名を決められません。');
  }
  return CONTRACT_FILE_PREFIX + employeeNumber + CONTRACT_FILE_SEPARATOR + name;
}

/** フォルダの中から、名前が完全に同じ Googleドキュメント（ゴミ箱のものを除く）を探す */
function findDocumentsByName_(folder, fileName) {
  const found = [];
  const files = folder.getFilesByName(fileName);
  while (files.hasNext()) {
    const file = files.next();
    if (!file.isTrashed() && file.getMimeType() === MimeType.GOOGLE_DOCS) {
      found.push(file);
    }
  }
  return found;
}

/**
 * テンプレートをコピーして差し込み、完成名にしたファイルを返す。
 *   1. テンプレートに26個のプレースホルダーがそろっているか確かめる（足りなければ作らずに止める）
 *   2. 仮の名前「作成中_…」でコピーする
 *   3. 差し込む
 *   4. {{…}} が残っていないか確かめる（残っていれば仮の名前のまま止める）
 *   5. 完成名に変える
 * 途中で止まった仮のファイルは消さない（ログと契約書エラーに名前とURLを残す）。
 */
function createContractDocument_(folder, fileName, replacements, context) {
  const templateFile = openContractTemplateFile_();
  const missing = findMissingPlaceholders_(DocumentApp.openById(templateFile.getId()));
  if (missing.length > 0) {
    throw new Error('テンプレートに次のプレースホルダーがありません：' + missing.join('、') +
      '。契約書は作りませんでした。');
  }

  const draftName = CONTRACT_DRAFT_PREFIX + fileName;
  const draftFile = templateFile.makeCopy(draftName, folder);
  context.fileName = draftName;
  context.fileUrl = draftFile.getUrl();

  const document = DocumentApp.openById(draftFile.getId());
  replacePlaceholders_(document, replacements);
  document.saveAndClose();

  const leftovers = findLeftoverPlaceholders_(DocumentApp.openById(draftFile.getId()));
  if (leftovers.length > 0) {
    throw new Error('差し込んだあとも、次のプレースホルダーが残っています：' + leftovers.join('、') +
      '。仮の名前のまま残しました。');
  }

  draftFile.setName(fileName);
  context.fileName = fileName;
  return draftFile;
}

// ------------------------------------------------------------
// 社員台帳の読み書き（第3段階）
// ------------------------------------------------------------

/**
 * 社員番号で台帳の行を探し、「見出し → 値」の形で返す（行の番号で決め打ちしない）。
 *   values：セルの値（日付は日付として読める）
 *   displays：画面に見えている文字（時刻に使う）
 * 見つからない・2行以上ある場合はエラーにする。
 */
function readLedgerEmployee_(ledgerSheet, employeeNumber) {
  assertLedgerHasContractColumns_(ledgerSheet);
  const lastRow = ledgerSheet.getLastRow();
  if (lastRow < FIRST_DATA_ROW) {
    throw new Error('社員台帳に ' + employeeNumber + ' が見つかりません。');
  }
  const range = ledgerSheet.getRange(FIRST_DATA_ROW, 1, lastRow - FIRST_DATA_ROW + 1, LEDGER_HEADERS.length);
  const rowValues = range.getValues();
  const rowDisplays = range.getDisplayValues();

  const matchedIndexes = [];
  rowDisplays.forEach(function (row, index) {
    if (toText_(row[0]) === employeeNumber) {
      matchedIndexes.push(index);
    }
  });
  if (matchedIndexes.length === 0) {
    throw new Error('社員台帳に ' + employeeNumber + ' が見つかりません。');
  }
  if (matchedIndexes.length > 1) {
    throw new Error('社員台帳に ' + employeeNumber + ' が ' + matchedIndexes.length +
      ' 行あります。どの行か決められないため、作りませんでした。');
  }

  const index = matchedIndexes[0];
  const values = {};
  const displays = {};
  LEDGER_HEADERS.forEach(function (header, column) {
    values[header] = rowValues[index][column];
    displays[header] = rowDisplays[index][column];
  });
  return {
    row: FIRST_DATA_ROW + index,
    employeeNumber: employeeNumber,
    values: values,
    displays: displays,
  };
}

/**
 * 台帳の AE・AF に、契約書の URL と作成日時を書く。
 * 書く直前に社員番号で行を探し直す。AE にすでに値があれば上書きしない。
 */
function saveContractInfoToLedger_(ledgerSheet, employeeNumber, url, createdAt) {
  const employee = readLedgerEmployee_(ledgerSheet, employeeNumber);
  if (toText_(employee.displays[CONTRACT_URL_HEADER]) !== '') {
    throw new Error('社員台帳の「' + CONTRACT_URL_HEADER + '」にすでに値が入っているため、上書きしませんでした。');
  }
  const firstColumn = LEDGER_HEADERS.indexOf(CONTRACT_URL_HEADER) + 1;
  const range = ledgerSheet.getRange(employee.row, firstColumn, 1, LEDGER_CONTRACT_HEADERS.length);
  range.setNumberFormats([LEDGER_CONTRACT_HEADERS.map(function (header) {
    return header === CONTRACT_CREATED_HEADER ? NUMBER_FORMATS.DATE_TIME : '';
  })]);
  range.setValues([[url, createdAt]]);
}

/** 開始番号以上で、契約書URL（AE）が空欄の社員番号を、台帳の上から順に返す */
function findEmployeesWithoutContract_(ledgerSheet, startNumber) {
  assertLedgerHasContractColumns_(ledgerSheet);
  const lastRow = ledgerSheet.getLastRow();
  if (lastRow < FIRST_DATA_ROW) {
    return [];
  }
  const rows = ledgerSheet.getRange(FIRST_DATA_ROW, 1, lastRow - FIRST_DATA_ROW + 1, LEDGER_HEADERS.length)
    .getDisplayValues();
  const urlIndex = LEDGER_HEADERS.indexOf(CONTRACT_URL_HEADER);
  return rows.filter(function (row) {
    const number = parseEmployeeNumber_(row[0]);
    return number !== null && number >= startNumber && toText_(row[urlIndex]) === '';
  }).map(function (row) {
    return toText_(row[0]);
  });
}

// ------------------------------------------------------------
// 契約書エラーの記録
// ------------------------------------------------------------

/**
 * 契約書を作れなかった理由を、実行ログと「契約書エラー」シートに残す。
 * シートへの記録に失敗しても、ログには残し、それ以上エラーを広げない。
 */
function recordContractError_(spreadsheet, context, message) {
  Logger.log('契約書を作れませんでした（' + context.employeeNumber + ' ' + context.name + '）：' + message +
    (context.fileName ? '／対象ファイル：' + context.fileName + ' ' + context.fileUrl : ''));
  try {
    const errorSheet = spreadsheet.getSheetByName(CONTRACT_ERROR_SHEET_NAME);
    if (!errorSheet) {
      Logger.log('「' + CONTRACT_ERROR_SHEET_NAME + '」シートがないため、シートには記録できませんでした。');
      return;
    }
    const rowValues = [
      new Date(),
      context.employeeNumber,
      context.name,
      CONTRACT_ERROR_TYPES.CREATION,
      message,
      context.fileName,
      context.fileUrl,
    ];
    const range = errorSheet.getRange(errorSheet.getLastRow() + 1, 1, 1, rowValues.length);
    range.setNumberFormats([CONTRACT_ERROR_HEADERS.map(function (header, index) {
      return index === 0 ? NUMBER_FORMATS.DATE_TIME : '';
    })]);
    range.setValues([rowValues]);
  } catch (sheetError) {
    Logger.log('「' + CONTRACT_ERROR_SHEET_NAME + '」シートへの記録にも失敗しました：' + getErrorMessage_(sheetError));
  }
}

function getErrorMessage_(error) {
  return error && error.message ? error.message : String(error);
}

// ============================================================
// 第4段階：契約終了まで30日以内の対象者の抽出
// ============================================================

/**
 * 第4段階。ここを実行する（手で実行する。トリガーにはつながない）。
 *   1. 社員台帳を読む（読むだけで、書き込まない）
 *   2. 契約終了日が「今日から0〜30日後」の社員を選ぶ
 *   3. 残り日数が少ない順（同じなら社員番号順）に並べる
 *   4. 「契約終了予定」シートの2行目以下を作り直し、実行ログにも出す
 * 社員台帳・フォーム回答・登録エラー・契約書エラー・Drive の契約書は変えない。
 */
function extractContractsEndingSoon() {
  const spreadsheet = openSavedSpreadsheet_();
  const ledgerSheet = getRequiredSheet_(spreadsheet, LEDGER_SHEET_NAME);
  const timeZone = spreadsheet.getSpreadsheetTimeZone();
  const today = new Date();

  // 台帳を読み終えてからシートを用意する（台帳の見出しが違えば、シートを作らずに止まる）
  const extraction = findContractsEndingSoon_(ledgerSheet, today, timeZone);
  const resultSheet = ensureSheetWithHeaders_(spreadsheet, CONTRACT_END_SHEET_NAME, CONTRACT_END_HEADERS);
  writeContractEndResults_(resultSheet, extraction.targets);
  logContractEndResults_(extraction, today, timeZone);
}

/**
 * 第4段階の確認用。ここを実行する。
 * 決まった日付で「残り日数」と「対象かどうか」を確かめる。
 * 社員台帳もシートも読まず、何も書き込まない。1件でも違っていれば、最後にエラーにする。
 */
function testContractEndBoundaries() {
  const cases = buildContractEndBoundaryCases_();
  let failedCount = 0;
  cases.forEach(function (testCase) {
    const today = parseBoundaryTestDate_(testCase.today);
    const endDate = parseBoundaryTestDate_(testCase.endDate);
    const remainingDays = countDaysUntil_(endDate, today, BOUNDARY_TEST_TIME_ZONE);
    const isTarget = isWithinContractEndAlert_(remainingDays);
    const passed = remainingDays === testCase.expectedDays && isTarget === testCase.expectedTarget;
    if (!passed) {
      failedCount += 1;
    }
    Logger.log((passed ? 'OK' : 'NG') + '：' + testCase.label +
      '（今日 ' + testCase.today + ' → 契約終了日 ' + testCase.endDate + '）' +
      '残り ' + remainingDays + '日・' + toTargetLabel_(isTarget) +
      (passed ? '' : '／期待：残り ' + testCase.expectedDays + '日・' + toTargetLabel_(testCase.expectedTarget)));
  });
  if (failedCount > 0) {
    throw new Error('境界テスト：' + cases.length + '件中 ' + failedCount + '件が期待と違いました。上のログの NG を確認してください。');
  }
  Logger.log('境界テスト：' + cases.length + '件すべて OK です。');
}

// ------------------------------------------------------------
// 対象者を探す
// ------------------------------------------------------------

/**
 * 社員台帳から、契約終了日が今日から0〜30日後の社員を探す。
 *   targets：対象者（残り日数が少ない順、同じなら社員番号順）
 *   unreadable：契約終了日が日付として読めなかった社員番号（対象にしない）
 *   checkedCount：確認した社員の人数
 */
function findContractsEndingSoon_(ledgerSheet, today, timeZone) {
  const employees = readLedgerForContractEnd_(ledgerSheet);
  const targets = [];
  const unreadable = [];
  employees.forEach(function (employee) {
    const endDate = employee.values[QUESTIONS.CONTRACT_END];
    if (!isValidDate_(endDate)) {
      unreadable.push(employee.employeeNumber);
      return;
    }
    const remainingDays = countDaysUntil_(endDate, today, timeZone);
    if (isWithinContractEndAlert_(remainingDays)) {
      targets.push({
        employeeNumber: employee.employeeNumber,
        remainingDays: remainingDays,
        values: employee.values,
      });
    }
  });
  targets.sort(compareContractEndTargets_);
  return { targets: targets, unreadable: unreadable, checkedCount: employees.length };
}

/**
 * 社員台帳の2行目以下を読み、社員番号がある行を「見出し → 値」の形で返す（読むだけ）。
 * 列は見出しの名前で探す。A〜AD の見出しが第2段階と違えば止める。
 */
function readLedgerForContractEnd_(ledgerSheet) {
  assertHeaders_(ledgerSheet, LEDGER_BASE_HEADERS);
  const lastRow = ledgerSheet.getLastRow();
  if (lastRow < FIRST_DATA_ROW) {
    return []; // 見出しだけ
  }
  const rows = ledgerSheet.getRange(FIRST_DATA_ROW, 1, lastRow - FIRST_DATA_ROW + 1, LEDGER_BASE_HEADERS.length)
    .getValues();
  const numberIndex = LEDGER_BASE_HEADERS.indexOf(EMPLOYEE_NUMBER_HEADER);

  const employees = [];
  rows.forEach(function (row) {
    const employeeNumber = toText_(row[numberIndex]);
    if (employeeNumber === '') {
      return; // 空の行は飛ばす
    }
    const values = {};
    LEDGER_BASE_HEADERS.forEach(function (header, column) {
      values[header] = row[column];
    });
    employees.push({ employeeNumber: employeeNumber, values: values });
  });
  return employees;
}

/** 残り日数が少ない順。同じなら社員番号順（EMP-0002 → EMP-0010 のように数字で比べる） */
function compareContractEndTargets_(a, b) {
  if (a.remainingDays !== b.remainingDays) {
    return a.remainingDays - b.remainingDays;
  }
  const numberA = parseEmployeeNumber_(a.employeeNumber);
  const numberB = parseEmployeeNumber_(b.employeeNumber);
  if (numberA !== null && numberB !== null) {
    return numberA - numberB;
  }
  return a.employeeNumber < b.employeeNumber ? -1 : a.employeeNumber > b.employeeNumber ? 1 : 0;
}

// ------------------------------------------------------------
// 日数の計算（境界テストでも使う）
// ------------------------------------------------------------

/** 日付として使える値なら true */
function isValidDate_(value) {
  return value instanceof Date && !isNaN(value.getTime());
}

/**
 * 今日から契約終了日まで、あと何日か。
 * 時刻は捨てて、日付どうしで数える（今日＝0、明日＝1、昨日＝-1）。
 */
function countDaysUntil_(endDate, today, timeZone) {
  return toDayNumber_(endDate, timeZone) - toDayNumber_(today, timeZone);
}

/**
 * 日付を「1970年1月1日から何日目か」にする。
 * タイムゾーンで年・月・日を取り出してから数えるので、実行した時刻や、月末・年末に左右されない。
 */
function toDayNumber_(date, timeZone) {
  const parts = Utilities.formatDate(date, timeZone, DATE_KEY_FORMAT).split('-').map(Number);
  const year = parts[0];
  const monthIndex = parts[1] - 1; // Date.UTC の月は 0 から数える（1月＝0）
  const day = parts[2];
  return Date.UTC(year, monthIndex, day) / MS_PER_DAY;
}

/** 残り日数が 0〜30 なら対象 */
function isWithinContractEndAlert_(remainingDays) {
  return remainingDays >= 0 && remainingDays <= CONTRACT_END_ALERT_DAYS;
}

// ------------------------------------------------------------
// 「契約終了予定」シートへの書き出しと、実行ログ
// ------------------------------------------------------------

/** 見出しは残し、2行目以下を消してから、対象者を書き直す */
function writeContractEndResults_(resultSheet, targets) {
  clearContractEndResults_(resultSheet);
  if (targets.length === 0) {
    return;
  }
  const rows = targets.map(buildContractEndRow_);
  const range = resultSheet.getRange(FIRST_DATA_ROW, 1, rows.length, CONTRACT_END_HEADERS.length);
  const formats = buildContractEndNumberFormats_();
  range.setNumberFormats(rows.map(function () {
    return formats;
  }));
  range.setValues(rows);
}

/** 「契約終了予定」シートの2行目以下（6列ぶん）の値を消す。見出しは消さない */
function clearContractEndResults_(resultSheet) {
  const lastRow = resultSheet.getLastRow();
  if (lastRow < FIRST_DATA_ROW) {
    return; // 見出しだけ
  }
  resultSheet.getRange(FIRST_DATA_ROW, 1, lastRow - FIRST_DATA_ROW + 1, CONTRACT_END_HEADERS.length).clearContent();
}

/** 1人分の行（見出しの順）。残り日数だけは計算した値、ほかは社員台帳の値 */
function buildContractEndRow_(target) {
  return CONTRACT_END_HEADERS.map(function (header) {
    return header === REMAINING_DAYS_HEADER ? target.remainingDays : target.values[header];
  });
}

/** 各列の表示形式（'' は自動のまま） */
function buildContractEndNumberFormats_() {
  return CONTRACT_END_HEADERS.map(function (header) {
    if (header === QUESTIONS.CONTRACT_END) {
      return NUMBER_FORMATS.DATE;
    }
    if (header === REMAINING_DAYS_HEADER) {
      return NUMBER_FORMATS.INTEGER;
    }
    return '';
  });
}

function logContractEndResults_(extraction, today, timeZone) {
  Logger.log('基準日（今日）：' + Utilities.formatDate(today, timeZone, NUMBER_FORMATS.DATE) +
    '／社員台帳の ' + extraction.checkedCount + '人を確認しました。');
  Logger.log('契約終了まで ' + CONTRACT_END_ALERT_DAYS + '日以内の対象者：' + extraction.targets.length + '人');
  extraction.targets.forEach(function (target) {
    Logger.log('  ' + [
      target.employeeNumber,
      toText_(target.values[QUESTIONS.NAME]),
      toText_(target.values[QUESTIONS.DEPARTMENT]),
      '契約終了日 ' + Utilities.formatDate(target.values[QUESTIONS.CONTRACT_END], timeZone, NUMBER_FORMATS.DATE),
      '残り ' + target.remainingDays + '日',
      toText_(target.values[QUESTIONS.RENEWAL]),
    ].join('／'));
  });
  if (extraction.unreadable.length > 0) {
    Logger.log('契約終了日が日付として読めず、対象にしなかった社員：' + extraction.unreadable.join('、'));
  }
  Logger.log('「' + CONTRACT_END_SHEET_NAME + '」シートに書き出しました（2行目以下を作り直しました）。');
}

// ------------------------------------------------------------
// 境界テストの部品
// ------------------------------------------------------------

/**
 * 境界テストの一覧。日付はすべて固定（実行した日に左右されない）。
 * 2026年の2月は28日まで。
 */
function buildContractEndBoundaryCases_() {
  return [
    { label: '昨日（-1日）', today: '2026/09/26 09:00', endDate: '2026/09/25 00:00', expectedDays: -1, expectedTarget: false },
    { label: '今日（0日）', today: '2026/09/26 09:00', endDate: '2026/09/26 00:00', expectedDays: 0, expectedTarget: true },
    { label: '明日（1日）', today: '2026/09/26 09:00', endDate: '2026/09/27 00:00', expectedDays: 1, expectedTarget: true },
    { label: '30日後', today: '2026/09/26 09:00', endDate: '2026/10/26 00:00', expectedDays: 30, expectedTarget: true },
    { label: '31日後', today: '2026/09/26 09:00', endDate: '2026/10/27 00:00', expectedDays: 31, expectedTarget: false },
    { label: '月をまたぐ・30日後（2月をはさむ）', today: '2026/01/31 09:00', endDate: '2026/03/02 00:00', expectedDays: 30, expectedTarget: true },
    { label: '月をまたぐ・31日後（2月をはさむ）', today: '2026/01/31 09:00', endDate: '2026/03/03 00:00', expectedDays: 31, expectedTarget: false },
    { label: '年をまたぐ・30日後', today: '2026/12/15 09:00', endDate: '2027/01/14 00:00', expectedDays: 30, expectedTarget: true },
    { label: '年をまたぐ・31日後', today: '2026/12/15 09:00', endDate: '2027/01/15 00:00', expectedDays: 31, expectedTarget: false },
    { label: '夜に実行しても今日は0日', today: '2026/09/26 23:59', endDate: '2026/09/26 00:00', expectedDays: 0, expectedTarget: true },
    { label: '夜に実行しても30日後は対象', today: '2026/09/26 23:59', endDate: '2026/10/26 00:00', expectedDays: 30, expectedTarget: true },
  ];
}

/** '2026/09/26 09:00' → 東京時間のその日時 */
function parseBoundaryTestDate_(text) {
  return Utilities.parseDate(text, BOUNDARY_TEST_TIME_ZONE, BOUNDARY_TEST_DATE_FORMAT);
}

function toTargetLabel_(isTarget) {
  return isTarget ? TARGET_LABELS.YES : TARGET_LABELS.NO;
}

// ============================================================
// 第5段階：毎朝のメール通知・二重通知の防止・時間主導トリガー
// ============================================================

/**
 * 第5段階。手で実行しても、毎朝のトリガーから呼ばれても、同じように動く。
 *   1. ロックを取る（手動とトリガーが重なっても、1つずつ順番に動かす）
 *   2. 設定を読む（テストモードなら、テスト用の送り先だけ）
 *   3. 社員台帳から対象者を抽出し直し、「契約終了予定」シートを同じ内容に作り直す
 *   4. 対象者が0人なら、メールは送らずに終わる
 *   5. 今日すでに通知した人を除く。全員通知済みなら送らずに終わる
 *   6. 通知履歴に「送信中」と書いてから、まとめメールを1通送る
 *   7. 送れたら「送信済み」、失敗したら「送信失敗」に書き換える
 * 社員台帳・フォーム回答・登録エラー・契約書エラー・Drive の契約書は変えない。
 */
function notifyContractsEndingSoon() {
  const lock = LockService.getScriptLock();
  lock.waitLock(LOCK_TIMEOUT_MS); // 待ちきれなければエラーになり、メールは送らない
  try {
    runContractEndNotification_();
  } finally {
    lock.releaseLock();
  }
}

/**
 * 毎日8時台に notifyContractsEndingSoon を動かすトリガーを作る。ここを実行する。
 * 同じ関数の時間主導トリガーがすでにあれば、作らない（何度実行しても1つだけ）。
 * テスト用の設定（基準日・わざと失敗）が残っている間は、作らずに止める。
 */
function setupDailyNotificationTrigger() {
  const leftovers = [NOTIFY_PROPERTY_KEYS.TEST_BASE_DATE, NOTIFY_PROPERTY_KEYS.TEST_FORCE_SEND_ERROR]
    .filter(function (key) {
      return getScriptProperty_(key) !== '';
    });
  if (leftovers.length > 0) {
    throw new Error('テスト用の設定 ' + leftovers.join('、') + ' が残っています。' +
      'スクリプト プロパティから削除してから、もう一度実行してください。トリガーは作りませんでした。');
  }

  const existing = findNotificationTriggers_();
  if (existing.length > 0) {
    Logger.log('毎朝の通知トリガーはすでに ' + existing.length + '件あるので、作りませんでした。');
    return;
  }
  ScriptApp.newTrigger(NOTIFICATION_TRIGGER_HANDLER)
    .timeBased()
    .everyDays(DAYS_BETWEEN_NOTIFICATIONS)
    .atHour(NOTIFICATION_HOUR)
    .create();
  Logger.log('毎朝の通知トリガーを作りました（毎日 ' + NOTIFICATION_HOUR + '時台に ' + NOTIFICATION_TRIGGER_HANDLER + ' を実行）。');
}

/** notifyContractsEndingSoon を呼ぶ時間主導トリガーの一覧 */
function findNotificationTriggers_() {
  return ScriptApp.getProjectTriggers().filter(function (trigger) {
    return trigger.getHandlerFunction() === NOTIFICATION_TRIGGER_HANDLER &&
      trigger.getEventType() === ScriptApp.EventType.CLOCK;
  });
}

// ------------------------------------------------------------
// 通知の本体（ロックの中で動く）
// ------------------------------------------------------------

function runContractEndNotification_() {
  // 設定が足りなければ、何も読まず・何も書かずに止める
  const settings = readNotificationSettings_();
  Logger.log('送信モード：' + settings.modeLabel + (settings.isTestMode ? '（テスト用の送り先にだけ送ります）' : ''));

  const spreadsheet = openSavedSpreadsheet_();
  const timeZone = spreadsheet.getSpreadsheetTimeZone();
  const ledgerSheet = getRequiredSheet_(spreadsheet, LEDGER_SHEET_NAME);
  const baseDate = decideNotificationBaseDate_(settings, timeZone);

  // 第4段階と同じ部品で抽出し直し、「契約終了予定」シートも同じ内容に作り直す
  const extraction = findContractsEndingSoon_(ledgerSheet, baseDate, timeZone);
  const resultSheet = ensureSheetWithHeaders_(spreadsheet, CONTRACT_END_SHEET_NAME, CONTRACT_END_HEADERS);
  writeContractEndResults_(resultSheet, extraction.targets);
  logContractEndResults_(extraction, baseDate, timeZone);

  if (extraction.targets.length === 0) {
    Logger.log('対象者が0人のため、メールは送りませんでした。');
    return;
  }

  const historySheet = ensureSheetWithHeaders_(spreadsheet, NOTIFICATION_HISTORY_SHEET_NAME, NOTIFICATION_HISTORY_HEADERS);
  const notifyDate = formatDateText_(baseDate, timeZone);
  const pending = excludeAlreadyNotified_(historySheet, extraction.targets, notifyDate, settings.modeLabel, timeZone);
  const skippedCount = extraction.targets.length - pending.length;
  if (pending.length === 0) {
    Logger.log('対象者 ' + extraction.targets.length + '人は、' + notifyDate + ' にすでに通知済みのため、メールは送りませんでした。');
    return;
  }
  if (skippedCount > 0) {
    Logger.log('対象者のうち ' + skippedCount + '人は、' + notifyDate + ' にすでに通知済みなので、今回のメールから除きます。');
  }

  // 送れる数が残っていなければ、履歴に書く前に止める
  if (MailApp.getRemainingDailyQuota() < MIN_MAIL_QUOTA) {
    throw new Error('今日のメール送信数の上限に達しています。メールは送りませんでした（通知履歴にも書いていません）。');
  }

  sendAndRecordNotification_(historySheet, settings, pending, skippedCount, baseDate, notifyDate, timeZone);
}

/**
 * 「送信中」を書く → 送る → 「送信済み」か「送信失敗」に書き換える。
 *   ・「送信中」を書けなければ、送らない（記録なしで送ると、二重送信を防げないため）
 *   ・送信に失敗したら「送信失敗」にする（通知済みにしないので、次の実行で送り直す）
 *   ・送れたのに「送信済み」にできなければ、「送信中」のまま残す（通知済みとして数えるので、二重には送らない）
 */
function sendAndRecordNotification_(historySheet, settings, pending, skippedCount, baseDate, notifyDate, timeZone) {
  const block = appendNotificationRows_(historySheet, pending, notifyDate, settings.modeLabel, timeZone);
  SpreadsheetApp.flush(); // 「送信中」を確定させてから送る

  try {
    sendContractEndMail_(settings, pending, skippedCount, baseDate, timeZone);
  } catch (error) {
    const message = getErrorMessage_(error);
    try {
      updateNotificationStatus_(historySheet, block, NOTIFICATION_STATUS.FAILED, message);
    } catch (recordError) {
      throw new Error('メールの送信に失敗し、通知履歴を「' + NOTIFICATION_STATUS.FAILED + '」にもできませんでした。' +
        '通知履歴の ' + block.firstRow + '行目から ' + block.count + '行が「' + NOTIFICATION_STATUS.SENDING + '」のままです。' +
        '手で「' + NOTIFICATION_STATUS.FAILED + '」に直すと、次の実行で送り直します。送信のエラー：' + message +
        '／記録のエラー：' + getErrorMessage_(recordError));
    }
    throw new Error('メールの送信に失敗しました。通知履歴を「' + NOTIFICATION_STATUS.FAILED + '」にしました（次の実行で送り直します）：' + message);
  }

  try {
    updateNotificationStatus_(historySheet, block, NOTIFICATION_STATUS.SENT, '');
  } catch (recordError) {
    throw new Error('メールは送りましたが、通知履歴を「' + NOTIFICATION_STATUS.SENT + '」にできませんでした。' +
      '「' + NOTIFICATION_STATUS.SENDING + '」のまま残しているので、二重には送りません。' +
      '通知履歴の ' + block.firstRow + '行目からを確認してください：' + getErrorMessage_(recordError));
  }
  Logger.log(settings.modeLabel + 'の送り先に、' + pending.length + '人分のまとめメールを1通送りました。');
}

// ------------------------------------------------------------
// 設定（Script Properties）
// ------------------------------------------------------------

/**
 * 送信モードと送り先を決める。
 *   テストモード：NOTIFY_TEST_RECIPIENT だけを送り先にする。NOTIFY_HR_RECIPIENT は読まない
 *   本番モード　：NOTIFY_HR_RECIPIENT を送り先にする。テスト用の設定（基準日・わざと失敗）は読まない
 * 送り先が空欄、またはメールアドレス1つの形でなければ、止める。
 */
function readNotificationSettings_() {
  if (NOTIFICATION_TEST_MODE) {
    return {
      isTestMode: true,
      modeLabel: NOTIFICATION_MODE_LABELS.TEST,
      recipient: readRecipient_(NOTIFY_PROPERTY_KEYS.TEST_RECIPIENT),
      baseDateText: getScriptProperty_(NOTIFY_PROPERTY_KEYS.TEST_BASE_DATE),
      forceSendError: getScriptProperty_(NOTIFY_PROPERTY_KEYS.TEST_FORCE_SEND_ERROR).toLowerCase() === FORCE_SEND_ERROR_ON,
    };
  }
  return {
    isTestMode: false,
    modeLabel: NOTIFICATION_MODE_LABELS.PRODUCTION,
    recipient: readRecipient_(NOTIFY_PROPERTY_KEYS.HR_RECIPIENT),
    baseDateText: '',
    forceSendError: false,
  };
}

/** 送り先を読む。空欄、または1つのメールアドレスの形でなければ止める */
function readRecipient_(key) {
  const recipient = getScriptProperty_(key);
  if (recipient === '') {
    throw new Error('送り先 ' + key + ' がスクリプト プロパティに設定されていません。メールは送りませんでした。');
  }
  if (!SINGLE_EMAIL_PATTERN.test(recipient)) {
    throw new Error('送り先 ' + key + ' は、メールアドレス1つだけにしてください。メールは送りませんでした。');
  }
  return recipient;
}

/** Script Properties の値を、前後の空白を取った文字で返す（なければ ''） */
function getScriptProperty_(key) {
  return toText_(PropertiesService.getScriptProperties().getProperty(key));
}

/**
 * 抽出の基準日を決める。
 * テストモードで NOTIFY_TEST_BASE_DATE があれば、その日。なければ今日。本番モードでは必ず今日。
 */
function decideNotificationBaseDate_(settings, timeZone) {
  if (!settings.isTestMode || settings.baseDateText === '') {
    return new Date();
  }
  const baseDate = parseTestBaseDate_(settings.baseDateText, timeZone);
  Logger.log('【テスト】' + NOTIFY_PROPERTY_KEYS.TEST_BASE_DATE + ' により、' + settings.baseDateText + ' を今日として扱います。');
  return baseDate;
}

/** '2027/03/01' → その日の日付。2027/02/30 のような、ない日付は止める */
function parseTestBaseDate_(text, timeZone) {
  if (!TEST_BASE_DATE_PATTERN.test(text)) {
    throw new Error(NOTIFY_PROPERTY_KEYS.TEST_BASE_DATE + ' は ' + TEST_BASE_DATE_FORMAT + ' の形で入れてください：' + text);
  }
  const date = Utilities.parseDate(text, timeZone, TEST_BASE_DATE_FORMAT);
  if (formatDateText_(date, timeZone) !== text) {
    throw new Error(NOTIFY_PROPERTY_KEYS.TEST_BASE_DATE + ' がない日付です：' + text);
  }
  return date;
}

/** 日付 → 2026/09/26 */
function formatDateText_(date, timeZone) {
  return Utilities.formatDate(date, timeZone, NUMBER_FORMATS.DATE);
}

// ------------------------------------------------------------
// 通知履歴（二重通知の防止）
// ------------------------------------------------------------

/** 同じ通知日・同じ送信モードで、すでに通知済み（送信中・送信済み）の人を除いた対象者を返す */
function excludeAlreadyNotified_(historySheet, targets, notifyDate, modeLabel, timeZone) {
  const notifiedKeys = readNotifiedKeys_(historySheet, notifyDate, modeLabel);
  return targets.filter(function (target) {
    return !notifiedKeys[buildNotificationKey_(target.employeeNumber, formatTargetEndDate_(target, timeZone))];
  });
}

/** 通知履歴から「通知日と送信モードが同じで、状態が送信中・送信済み」の行の目印を集める */
function readNotifiedKeys_(historySheet, notifyDate, modeLabel) {
  const keys = {};
  const lastRow = historySheet.getLastRow();
  if (lastRow < FIRST_DATA_ROW) {
    return keys; // 見出しだけ
  }
  const rows = historySheet.getRange(FIRST_DATA_ROW, 1, lastRow - FIRST_DATA_ROW + 1, NOTIFICATION_HISTORY_HEADERS.length)
    .getDisplayValues();
  const column = buildHistoryColumnIndexes_();
  rows.forEach(function (row) {
    const isSameDay = toText_(row[column.date]) === notifyDate;
    const isSameMode = toText_(row[column.mode]) === modeLabel;
    const isNotified = NOTIFIED_STATUSES.indexOf(toText_(row[column.status])) !== -1;
    if (isSameDay && isSameMode && isNotified) {
      keys[buildNotificationKey_(toText_(row[column.employeeNumber]), toText_(row[column.endDate]))] = true;
    }
  });
  return keys;
}

/** 通知履歴の各列が何番目か（0から数える） */
function buildHistoryColumnIndexes_() {
  return {
    date: NOTIFICATION_HISTORY_HEADERS.indexOf(NOTIFY_DATE_HEADER),
    employeeNumber: NOTIFICATION_HISTORY_HEADERS.indexOf(EMPLOYEE_NUMBER_HEADER),
    endDate: NOTIFICATION_HISTORY_HEADERS.indexOf(QUESTIONS.CONTRACT_END),
    mode: NOTIFICATION_HISTORY_HEADERS.indexOf(NOTIFY_MODE_HEADER),
    status: NOTIFICATION_HISTORY_HEADERS.indexOf(NOTIFY_STATUS_HEADER),
  };
}

/** 「同じ人・同じ契約終了日」を見分ける目印：EMP-0006|2027/03/31 */
function buildNotificationKey_(employeeNumber, endDateText) {
  return employeeNumber + '|' + endDateText;
}

function formatTargetEndDate_(target, timeZone) {
  return formatDateText_(target.values[QUESTIONS.CONTRACT_END], timeZone);
}

/**
 * 対象者1人につき1行、状態「送信中」で通知履歴の最後に足す。
 * 足した場所（最初の行と行数）を返す。日付は文字で保存する（見た目どおりに比べられるように）。
 */
function appendNotificationRows_(historySheet, targets, notifyDate, modeLabel, timeZone) {
  const recordedAt = new Date();
  const rows = targets.map(function (target) {
    return NOTIFICATION_HISTORY_HEADERS.map(function (header) {
      switch (header) {
        case NOTIFY_DATE_HEADER: return notifyDate;
        case EMPLOYEE_NUMBER_HEADER: return target.employeeNumber;
        case QUESTIONS.CONTRACT_END: return formatTargetEndDate_(target, timeZone);
        case NOTIFY_MODE_HEADER: return modeLabel;
        case NOTIFY_STATUS_HEADER: return NOTIFICATION_STATUS.SENDING;
        case NOTIFY_RECORDED_AT_HEADER: return recordedAt;
        default: return ''; // 詳細
      }
    });
  });
  const firstRow = historySheet.getLastRow() + 1;
  const range = historySheet.getRange(firstRow, 1, rows.length, NOTIFICATION_HISTORY_HEADERS.length);
  const formats = buildHistoryNumberFormats_();
  range.setNumberFormats(rows.map(function () {
    return formats;
  }));
  range.setValues(rows);
  return { firstRow: firstRow, count: rows.length };
}

/** 通知履歴の各列の表示形式。日付は文字、記録日時は日時 */
function buildHistoryNumberFormats_() {
  return NOTIFICATION_HISTORY_HEADERS.map(function (header) {
    if (header === NOTIFY_DATE_HEADER || header === QUESTIONS.CONTRACT_END) {
      return NUMBER_FORMATS.TEXT;
    }
    if (header === NOTIFY_RECORDED_AT_HEADER) {
      return NUMBER_FORMATS.DATE_TIME;
    }
    return '';
  });
}

/** appendNotificationRows_ で足した行の「状態・記録日時・詳細」を書き換える */
function updateNotificationStatus_(historySheet, block, status, detail) {
  const firstColumn = NOTIFICATION_HISTORY_HEADERS.indexOf(NOTIFY_STATUS_HEADER) + 1;
  const values = [];
  for (let i = 0; i < block.count; i++) {
    values.push([status, new Date(), detail]);
  }
  historySheet.getRange(block.firstRow, firstColumn, block.count, values[0].length).setValues(values);
}

// ------------------------------------------------------------
// メール
// ------------------------------------------------------------

/**
 * まとめメールを1通送る。
 * テストモードで NOTIFY_TEST_FORCE_SEND_ERROR が true なら、MailApp を呼ぶ直前でわざと止める（メールは送らない）。
 */
function sendContractEndMail_(settings, targets, skippedCount, baseDate, timeZone) {
  const mail = buildContractEndMail_(settings, targets, skippedCount, baseDate, timeZone);
  if (settings.isTestMode && settings.forceSendError) {
    throw new Error('【テスト】' + NOTIFY_PROPERTY_KEYS.TEST_FORCE_SEND_ERROR +
      ' が true のため、送信の直前でわざと止めました（メールは送っていません）。');
  }
  MailApp.sendEmail(settings.recipient, mail.subject, mail.body);
}

/**
 * 件名：【テスト】契約終了予定のお知らせ（2026/09/26・2名）
 * 本文：前書き → 1人ずつ6項目（「契約終了予定」シートと同じ順・同じ並び） → 注意書き
 */
function buildContractEndMail_(settings, targets, skippedCount, baseDate, timeZone) {
  const baseDateText = formatDateText_(baseDate, timeZone);
  const subject = (settings.isTestMode ? MAIL_TEXTS.TEST_SUBJECT_PREFIX : '') + MAIL_TEXTS.SUBJECT +
    '（' + baseDateText + '・' + targets.length + MAIL_TEXTS.PERSON_SUFFIX + '）';

  const lines = ['契約終了まで ' + CONTRACT_END_ALERT_DAYS + '日以内の社員をお知らせします（基準日：' + baseDateText + '）。'];
  if (skippedCount > 0) {
    lines.push('このうち、本日すでにお知らせした ' + skippedCount + MAIL_TEXTS.PERSON_SUFFIX + 'は除いています。');
  }
  lines.push('');
  targets.forEach(function (target) {
    lines.push(MAIL_TEXTS.SEPARATOR);
    lines.push.apply(lines, buildMailPersonLines_(target, timeZone));
  });
  lines.push(MAIL_TEXTS.SEPARATOR, '', MAIL_TEXTS.FOOTER);
  if (settings.isTestMode) {
    lines.push(MAIL_TEXTS.TEST_NOTE);
  }
  return { subject: subject, body: lines.join('\n') };
}

/** 1人分の6行（見出し：値）。並びと中身は「契約終了予定」シートの1行と同じ */
function buildMailPersonLines_(target, timeZone) {
  const row = buildContractEndRow_(target);
  return CONTRACT_END_HEADERS.map(function (header, index) {
    return header + MAIL_TEXTS.LABEL_SEPARATOR + formatMailValue_(header, row[index], timeZone);
  });
}

function formatMailValue_(header, value, timeZone) {
  if (header === QUESTIONS.CONTRACT_END) {
    return formatDateText_(value, timeZone);
  }
  if (header === REMAINING_DAYS_HEADER) {
    return value + MAIL_TEXTS.DAYS_SUFFIX;
  }
  return toText_(value);
}
