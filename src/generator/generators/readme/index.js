const Generators = require("yeoman-generator");
const fs = require("fs");
const table = require("markdown-table");
const async = require("async");
// 工具函数
const generatePrompts = require("./generatePrompts");
// 默认要填写的内容
const path = require("path");
const mkdirp = require("mkdirp");
const chalk = require("chalk");
// 批量移动文件的方法
const cwd = process.cwd();
// 源文件的路径
const shell = require("shelljs");
const packJsBundle = require("./utils/build");
const indexTestJS = path.join(cwd, "./src/index.test.js");
const MarkdownTable = require("./utils/generateTable");
let NOTICE = ``;
/**
 * url是否是git仓库的正则表达式
 */
function matchGitRepository(url) {
  return url && /^git@\S*\.git/.test(url);
}

/**
 * 获取该仓库所属于的group+repository信息
 * "git@gitlab.alibaba-inc.com:qinliang.ql/RelationshipTransformation.git"
 */
function extractGroupAndRepository(url) {
  const [type, gitUrl] = url.split("@");
  const [gitlabUrl, focusPart] = gitUrl.split(":");
  const [group, repository] = focusPart.split("/");
  return {
    group,
    repository: repository.split(".")[0]
  };
}

class AppGenerator extends Generators.Base {
  constructor(args, options) {
    super(args, options);
    this.option("skip-welcome-message", {
      desc: "Skip the welcome message",
      type: Boolean,
      defaults: false
    });
    this.option("skip-install");
    // this.sourceRoot(baseRootPath);
    // 默认的root为"./templates",通过该方法覆盖
    this.config.save();
    //Calling `this.config.save()` from a generator for the first time will create the file(yo-rc.json).
  }

  initializing() {
    if (!this.options["skip-welcome-message"]) {
      this.log(require("yeoman-welcome"));
      this.log(
        "Out of the box I include Webpack and some default React components.\n"
      );
    }
  }

  prompting() {
    this.log("当你运行该命令的时候表示你需要发布你的组件到demo站点中,请知悉......");
    const prevPrompts = this.config;
    const prompts = generatePrompts(prevPrompts);
    return this.prompt(prompts).then(answers => {
      //如果用户输入的组件名称和默认的不一致，需要设置为默认的组件名称
      this.publish = answers.publish;
      // 为yoeman设置默认的全局变量
      this.appName = answers.appName;
      this.chineseName = answers.chineseName;
      this.desc = answers.desc;
      this.category = answers.category;
      this.developer = answers.developer;
      this.email = answers.email;
      this.respository = answers.respository;
      this.frame = answers.frame;
      this.platform = answers.platform;
      this.overallDesc = answers.overallDesc;
      this.when2Use = answers.when2Use;
      this.api = answers.api;
      this.demoTitle = answers.demoTitle;
      this.config.set("appName", this.appName);
      this.config.set("chineseName", this.chineseName);
      this.config.set("desc", this.desc);
      // demo说明
      this.config.set("category", this.category);
      this.config.set("frame", this.frame);
      this.config.set("platform", this.platform);
      this.config.set("overallDesc", this.overallDesc);
      // readme的说明
      this.config.set("api", this.api);
      this.config.set("when2Use", this.when2Use);
      // 这些变量用于子级Generator
      this.config.set("demoTitle", this.demoTitle);
      this.config.set("publish", this.publish);
      // 开发者，仓库，email等信息
      this.config.set("developer", this.developer);
      this.config.set("email", this.email);
      this.config.set("respository", this.respository);
      this.config.set("readmeGenerated", true);
    });
  }

  configuring() {}

  /**
   * 产生一个demo文件夹，将我们的文件移动到里
   */
  writing() {
    const fileContent = fs.readFileSync(path.join(cwd, "./package.json"));
    const packageJSON = JSON.parse(fileContent);
    const currentBranch = packageJSON.version;
    const tnpmPackageName = packageJSON.name;
    let dailyAssetsUrlPrefix, group, repository, fullRepositoryUrl;
    // 下面我需要把相应的build目录推送到某一个group下的某一个repository。可以在package.json中获取
    if (
      !packageJSON.repository &&
      !matchGitRepository(this.config.get("respository"))
    ) {
      this.log(
        "repository非git仓库，程序将退出，你可以手动在package.json中添加repository字段并重新运行该命令......."
      );
      process.exit(1);
    } else {
      // package.json或者用户自定义至少一个有配置信息，继续往下执行代码
      if (packageJSON.repository) {
        if (typeof packageJSON.repository == "object") {
          fullRepositoryUrl = packageJSON.repository.url;
          const { url } = packageJSON.repository;
          const detail = extractGroupAndRepository(url);
          group = detail.group;
          repository = detail.repository;
          // http://g-assets.daily.taobao.net/de/spring-festival-live/0.0.1/page/live/index.js
        } else if (matchGitRepository(packageJSON.repository)) {
          const detail = extractGroupAndRepository(packageJSON.repository);
          group = detail.group;
          repository = detail.repository;
          fullRepositoryUrl = packageJSON.repository;
        }
      } else {
        const userInputRepository = this.config.get("respository");
        const detail = extractGroupAndRepository(userInputRepository);
        group = detail.group;
        repository = detail.repository;
        fullRepositoryUrl = userInputRepository;
      }
      dailyAssetsUrlPrefix = `http://g-assets.daily.taobao.net/${group}/${repository}/${currentBranch}/`;
    }

    const demoPath = path.join(cwd, "./demo");
    // 直接打包到build目录下就可以了，每次清空就可以了~~~
    packJsBundle(
      indexTestJS,
      (
        generatedFiles,
        id,
        sourceCode,
        specifiers,
        antdImports,
        relativeExports,
        componentName,
        componentInfoArray
      ) => {
        // console.log("产生的文件列表为:" + JSON.stringify(generatedFiles));
        if (generatedFiles) {
          let dependencies = [];
          // 生成模板dependencies
          for (let i = 0, len = generatedFiles.length; i < len; i++) {
            dependencies.push(
              `- ${dailyAssetsUrlPrefix}${generatedFiles[i]}.js`
            );
          }
          dependencies.push(`- ${dailyAssetsUrlPrefix}main.js`);
          // 将antd绑定到全局上，添加到所有资源后面,同时从antd上import的元素全部从antd上直接获取
          dependencies.push(
            `- https://g-assets.daily.taobao.net/tvadmin/std-website-static-resource/0.0.2/moment-with-locales.js`
          );
          dependencies.push(
            `- https://g-assets.daily.taobao.net/tvadmin/std-website-static-resource/0.0.2/antd-with-locales.js`
          );
          let antdRawCode = "";
          for (let i = 0, len = antdImports.length; i < len; i++) {
            antdRawCode += `const ${antdImports[i]} = antd.${antdImports[
              i
            ]};\n`;
          }
          let relativeRawCode = "";
          let relativeRawCodeDescription = ``;
          // import {name,sex} from "./2exports.js";
          for (let j = 0, length = relativeExports.length; j < length; j++) {
            const { source, imports, key } = relativeExports[j];
            for (let k = 0; k < imports.length; k++) {
              relativeRawCodeDescription += `const ${imports[
                k
              ]} = require("${source}")["${imports[k]}"];\n`;
              relativeRawCode += `const ${imports[
                k
              ]} = window["${key}"]["${imports[k]}"];\n`;
            }
          }
          this.config.set("demoJSLists", dependencies.join("\n"));
          this.config.set("sourceCode", sourceCode);
          this.config.set("id", id);

          if (relativeRawCodeDescription) {
            NOTICE = `/**
            * 出现下面这种window[\d+]['X']的全局变量是因为你使用了import {A,B} from "./C.js";的格式
            * 不建议使用这种相对路径引入外部值，你可以直接将变量写在index.test.js中：
            * ${relativeRawCodeDescription}
            */`;
          }

          // console.log('准备产生表格数据为===='+JSON.stringify(componentInfoArray));
          const bitTables = MarkdownTable.generateBitMarkdownTable(
            componentInfoArray
          );
          const componentUsageTables = bitTables.reduce((prev, cur) => {
            prev += `组件${cur.specifier}接受的API如下:\n\n${cur.bitTable}\n\n\n`;
            return prev;
          }, "");

          //  需要顶格，否则有多余的空格
          const markdownReadmeTemplate = `---
category: ${this.config.get("category")}
name: ${this.config.get("appName")}
desc: ${this.config.get("chineseName")}
frame:
- ${this.config.get("frame")}
platform:
- ${this.config.get("platform")}
---

${this.config.get("overallDesc")}

## 何时使用

${this.config.get("when2Use")}

## API
下面是开发者写的该组件支持的参数:

${componentUsageTables}
`;

          //  前面必须顶格才能没有空格~~~
          const markdownDemoTemplate = `---
title: ${this.config.get("chineseName")}
dependencies:
${dependencies.join("\n")}
---

## ${this.config.get("demoTitle")}

${this.config.get("desc")}

\`\`\`css
\`\`\`

\`\`\`js
/**
 * \n${specifiers
   .reduce((prev, cur) => {
     if (!/^\d*$/.test(cur)) {
       prev.push(cur);
     }
     return prev;
   }, [])
   .join(",")},antd等变量已经挂载到window上,使用时请添加如下代码引入组件\n:
const ${componentName} = require("${tnpmPackageName}");
 * 
 */
${antdRawCode}
${NOTICE}
${relativeRawCode}
${sourceCode}
\`\`\`

\`\`\`html
<div id="${id}"></div>
\`\`\`
    `;
          async.parallel(
            [
              callback => {
                fs.writeFile(
                  // path.join(cwd, "./readme.md"),
                  path.join(cwd, "./std-readme.md"),
                  markdownReadmeTemplate,
                  () => {
                    callback(null, true);
                    this.log(chalk.green("README文件写入完毕!"));
                  }
                );
              },
              callback => {
                mkdirp(demoPath, err => {
                  fs.writeFile(
                    demoPath + "/basic.md",
                    markdownDemoTemplate,
                    () => {
                      callback(null, true);
                      this.log(chalk.green("使用实例文件写入完毕!"));
                    }
                  );
                });
              }
            ],
            (err, callback) => {
              /** 1.下面这种方式是调用npm run build，但是无法直接expose特定的变量，导致window上无法挂载
             *  2.其实是先发布具体的代码，然后才开始写readme，而不是先写readme再发布~~~
             * **/
              if (err) {
                this.log(chalk.red("创建规范站点发布文件失败,程序将退出......"));
                process.exit(1);
              } else {
                const needPublish = this.config.get("publish");
                if (!this.config.get("publish")) {
                  this.log(
                    chalk.red(
                      "规范站点需要的文件已经生成成功，你可以手动为package.json添加std:true要求发布......"
                    )
                  );
                } else {
                  let pkg = {};
                  pkg = JSON.parse(fileContent);
                  pkg["std"] = true;
                  // package.json设置repository配置
                  if (!matchGitRepository(fullRepositoryUrl)) {
                    this.log(
                      chalk.red("package.json和你输入的仓库地址都是不合法的,程序将退出......")
                    );
                    process.exit(1);
                  } else {
                    pkg.repository = {
                      type: "git",
                      url: fullRepositoryUrl
                    };
                    pkg.author = this.config.get("developer");
                    pkg.email = this.config.get("email");
                    pkg.repository = fullRepositoryUrl;
                  }
                  // git remote add origin git@gitlab.alibaba-inc.com:silvermine/tv-lottery-test.git
                  fs.writeFileSync(
                    path.join(cwd, "./package.json"),
                    JSON.stringify(pkg, null, 10)
                  );
                  // 1.编译build组件并checkout到一个分支，准备发布CDN
                  if (shell.which("npm")) {
                    if (shell.which("git")) {
                      // 首先推送一个master分支到gitlab上并设置为默认的分支，防止报错
                      const masterPushStatus = shell.exec(
                        `git init && git remote add origin ${fullRepositoryUrl} && git add -A && git commit -m "发布master分支" && git push origin master`
                      ).code;
                      // 推送master分支成功
                      if (!masterPushStatus) {
                        this.log(
                          chalk.green("master分支已经推送到gitlab上,准备推送当前分支....")
                        );
                      } else {
                        const masterPushStatus = shell.exec(
                          `git add -A && git commit -m "发布master分支"  && git push origin master`
                        ).code;

                        if (!masterPushStatus) {
                          this.log(
                            chalk.green("master分支已经推送到gitlab上,准备推送当前分支....")
                          );
                        } else {
                          this.log(chalk.red("master分支推送失败，程序将会退出....."));
                          process.exit(1);
                        }
                      }

                      const stdError = shell.exec(
                        `git checkout -b daily/${currentBranch} `,
                        { silent: true }
                      ).stderr;

                      // 1.Generator如果能自己写一个disk文件，这样用户只需要输入一次就可以了，我们的this.config.save干的就是这个事情~~~~~~
                      //   查看你的.yo-rc.json，直接通过this.config.get就可以获取了。不过这都是后续优化的内容了~~~~
                      // 2.解析index.test.js的内容，直接把里面的东西插入到demo的basic里面
                      if (/fatal/g.test(stdError)) {
                        // 该分支已经存在了
                      } else if (/on/g.test(stdError)) {
                        // 已经在该分支上了,切换分支成功
                      }
                      const pushCode = shell.exec(
                        `git push origin daily/${currentBranch}`
                      ).stdout;
                    } else {
                      this.log(chalk.red("demo发布的依赖的CDN文件发布失败......."));
                    }
                  }
                }
              }
            }
          );
        }
      }
    );
  }

  install() {}

  end() {
    this.log(chalk.green("Generator执行完成，等待其他操作完成后退出....."));
    // process.exit(0);
    // 异步调用不要随意调用process.exit(0)，否则回调还没有触发就直接退出了~~~~~导致异步回调函数根本没有调用~~~~
    //
  }
}
module.exports = AppGenerator;
