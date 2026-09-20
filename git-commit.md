# Git Commit 规范

良好的，遵循一定规则的提交信息不仅有助于编码历史的回顾，也有助于 **CHANGELOG** 等文件的生成。

### 格式 Format

每次提交，Commit message 都包括三个部分：**Header**，**Body** 和 **Footer**。其中，**Header** 是必需的，**Body** 和 **Footer** 可以省略。

```text
<type>(<scope>): <subject>
<空行>
<body>
<空行>
<footer>
```

不管是哪一个部分，任何一行都不得超过72个字符（或100个字符）。Header 部分只有一行，包括三个字段：`type`（必需）、`scope`（可选）和 `subject`（必需）。Footer 部分如果提交存在一个与之关联的 Issue 则要关联。

示例：

```text
docs(changelog): update changelog to beta.5
```

```text
fix(release): need to depend on latest rxjs and zone.js

The version in our package.json gets copied to the one we publish, 
and users need the latest of these.
```

### 主题 Subject

subject 是本次 commit 目的的简短描述，一般不要超过50个字符：

* **使用祈使句和现在时**：例如使用 "change" 而不是 "changed" 或 "changes"。
* **规范大小写和相应书写规则。**
* **无需加句号符标识结尾。**

### 类型 Type

类型是描述当前提交性质的枚举类型，含有以下的枚举值:

* **build**: Changes that affect the build system or external dependencies \(example scopes: gulp, broccoli, npm\)
* **ci**: Changes to our CI configuration files and scripts \(example scopes: Travis, Circle, BrowserStack, SauceLabs\)
* **docs**: 文档相关
* **feat**: 特性增加
* **fix**: 异常修复
* **perf**: 性能优化
* **refactor**: 代码重构
* **style**: 不影响代码含义的改动 \(white-space, formatting, missing semi-colons, etc\)
* **test**: 对测试的增加或修复
* **merge**: 分支合并（格式 -&gt; `orgin_branch into target_branch` ）

如果type为feat和fix，则该 commit 将肯定出现在 Change log 之中。其他情况（docs、chore、style、refactor、test）由你决定，要不要放入 Change log，建议是不要。

### 作用域 Scope

scope 用于说明 commit 影响的范围，比如数据层、控制层、视图层等等，视项目不同而不同，同样属于枚举类型。

通用的有：

* **$git**
* **$script**
* **$\*-script**
* **$npm**
* 等等

例如，Egg 项目：

* **$router**
* **$controller**
* **$srv**
* **$test**
* $**schedule**
* **$db**
* **$config**
* **$\*-config** \[ \* -&gt; webpack、eslint \]
* **$logger**
* 等等

其它常见的有：

* **$cmpt**
* **$container**
* **$view**
* **$api**
* 等等

### 主体 Body

Body是对本地提交的一个详细描述，需要注意的是，描述每行字符不应超过 72 个字符，这利于各种环境下良好的阅读体验。

### 脚注 Footer

Footer 部分只用于两种情况。**Breaking Changes（**_**不兼容改动**_**）** and commit **Closes（**_**关闭 Issue**_**）**.

**1、不兼容变动**

如果当前代码与上一个版本不兼容，则 Footer 部分以BREAKING CHANGE开头 —— **Breaking Changes** should start with the word `BREAKING CHANGE:` with a space or two newlines ，后面是对变动的描述、以及变动理由和迁移方法。

```text
BREAKING CHANGE: isolate scope bindings definition has changed.

To migrate the code follow the example below:

Before:

scope: {
  myAttr: 'attribute',
}

After:

scope: {
  myAttr: '@',
}

The removed `inject` wasn't generaly useful for directives so there should be no code using it.
```

**2、关闭或关联 Issue**

如果当前 commit 针对某个issue，那么可以在 Footer 部分关闭或关联这个 issue，或多个 issue 。

```text
Closes #234
Closes #123, #245, #992
Ref #234
```

### 回退 Revert

还有一种特殊情况，如果当前 commit 用于撤销以前的 commit，格式规定如下

* header 以  `revert:`  开头，后面跟着被撤销 commit 的 header
* body 以  `This reverts commit <hash>`  的格式，其中的`hash`是被撤销 commit 的 SHA 标识符。

```text
revert: feat(pencil): add 'graphiteWidth' option

This reverts commit 667ecc1654a317a13331b17617d973392f415f
```

如果当前 commit 与被撤销的 commit，在同一个发布（release）里面，那么它们都不会出现在 Change log 里面。如果两者在不同的发布，那么当前 commit，会出现在 Change log 的 `Reverts` 小标题下面。

A detailed explanation can be found in this [document](https://docs.google.com/document/d/1QrDFcIiPjSLDn3EL15IJygNPiHORgU1_OOAqWjiDU5Y/edit#).



### 工具 Tools

**Commitizen**

[commitizen](https://github.com/commitizen) 是一款用来生成规范化 commit 消息的工具。

```text
## 安装 commitizen
$ npm install --save-dev commitizen

## 安装 你喜好的 commitizen adapter , 例如 cz-conventional-changelog 
$ npm install --save-dev cz-conventional-changelog

## 配置
## 在项目目录里，运行下面的命令，使其支持 Angular 的 Commit message 格式。
$ npx commitizen init cz-conventional-changelog --save-dev --save-exact

## 使用
## 用 git cz命令来取代 git commit
```

**CommitLint**

[commitlint](https://github.com/marionebl/commitlint) 是一款用来校验 commit 消息格式合法性的工具。

```text
# 安装 CI
npm install --save-dev @commitlint/cli

# 安装 husky: 使 ghook 更容易
 --save-dev husky@next

# 配置 commitlint 使用 angular config
npm install --save-dev @commitlint/config-angular
echo "module.exports = {extends: ['@commitlint/config-angular']}" > commitlint.config.js

# 整合 commitizen
npm install --save-dev @commitlint/prompt

{
  "scripts": {
    "commit": "npx git-cz"
  },
  "config": {
    "commitizen": {
      "path": "./node_modules/@commitlint/prompt"
    }
  },
  "husky": {
    "hooks": {
      "commit-msg": "commitlint -e $GIT_PARAMS"
    }
  }
}
```

**ChangeLog**

```text
# 安装 CI
npm install --save-dev conventional-changelog-ci

# 安装 standard-version: 自动生成 CHANGELOG 并发布版本
npm install --save-dev standard-version

{
  "scripts": {
    "changelog": "npx conventional-changelog -p angular -i CHANGELOG.md -s -r 0 && git add CHANGELOG.md",
    "release": "npx standard-version"
  }
}
```

