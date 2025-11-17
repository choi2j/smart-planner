import { useState } from "react";

interface Plan {
	title: string | "";
	description: string | "";
	date: string | "";
	time: string | "";
	location: string | "";
	priority: string | "";
	status: boolean | null;
}

function App() {
	const [inputValue, setInputValue] = useState("");
	const [plans, setPlans] = useState<Plan[]>([
		{
			title: "",
			description: "",
			date: "",
			time: "",
			location: "",
			priority: "",
			status: null,
		},
	]);

	const handleInput = (event: React.ChangeEvent<HTMLInputElement>) => {
		setInputValue(event.target.value);
	};

	const handleSubmit = async () => {
		if (!inputValue) {
			console.error("전송할 값이 필요합니다.");
			return;
		}

		try {
			const response = await fetch("http://127.0.0.1:8000/todo-request", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					message: inputValue,
				}),
			});

			if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

			const data = await response.json();
			console.log(data);
			alert("데이터 전송 성공!");
			setInputValue("");
		} catch (error) {
			console.error(error);
			alert("데이터 전송 실패!");
		}
	};

	return (
		<>
			<div>
				<input type="text" name="" id="" value={inputValue} onChange={handleInput} />
				<button onClick={handleSubmit}>전송</button>
			</div>
		</>
	);
}

export default App;
